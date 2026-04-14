import re
import pytesseract
from PIL import Image
import pdfplumber


def parse_jumbo_png(filepath: str) -> list[dict]:
    """OCR a Jumbo receipt PNG and extract product lines."""
    img = Image.open(filepath)
    text = pytesseract.image_to_string(img, lang="nld+eng", config="--psm 6")
    lines = text.split("\n")

    items = []
    in_products = False
    price_pattern = re.compile(r"^(.+?)\s+(\d+[,\.]\d{2})\s*$")
    discount_pattern = re.compile(r"^(.+?)\s+(-\d+[,\.]\d{2})\s*$")

    for line in lines:
        line = line.strip()
        if not line:
            continue
        if "producten" in line.lower() or "artikelen" in line.lower():
            in_products = True
            continue
        if in_products and ("totaal" in line.lower() or "btw" in line.lower()):
            in_products = False
            continue
        if in_products:
            # Skip discount lines (negative prices)
            m = discount_pattern.match(line)
            if m:
                continue
            m = price_pattern.match(line)
            if m:
                name = m.group(1).strip()
                price_str = m.group(2).replace(",", ".")
                try:
                    price = float(price_str)
                except ValueError:
                    price = None
                if len(name) > 2 and not name.upper() == name:  # filter noise
                    items.append({"raw_name": name, "price": price, "quantity": 1.0})
    return items


def parse_netto_pdf(filepath: str) -> list[dict]:
    """Extract product lines from a Netto German receipt PDF."""
    items = []
    with pdfplumber.open(filepath) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            lines = text.split("\n")

            in_products = False
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                if re.search(r"EUR|Menge|Artikel", line, re.IGNORECASE):
                    in_products = True
                    continue
                if in_products and re.search(
                    r"Summe|Gesamt|Zwischensumme|Zahlung|EC-Karte|Bar", line, re.IGNORECASE
                ):
                    in_products = False
                    continue
                if in_products:
                    # Typical Netto line: "Produkt name    1,99 A" or "Produkt  1 x 1,99  1,99"
                    m = re.match(r"^(.+?)\s+([-]?\d+[,\.]\d{2})\s*[A-Z]?\s*$", line)
                    if m:
                        name = m.group(1).strip()
                        price_str = m.group(2).replace(",", ".")
                        try:
                            price = float(price_str)
                        except ValueError:
                            price = None
                        if price and price > 0 and len(name) > 2:
                            items.append({"raw_name": name, "price": price, "quantity": 1.0})
    return items

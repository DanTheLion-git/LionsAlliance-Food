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
    """Extract product lines from a Netto German receipt PDF.

    Netto uses a two-line format for multiples:
        3 x                          <- standalone quantity line
        Capri Sun Multi 10x0,2L PK   5,97 A  <- product + combined total price

    We detect the 'N x' line, hold the quantity, apply it to the next product
    line, and calculate the per-item price (total / qty).
    """
    items = []
    with pdfplumber.open(filepath) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            lines = text.split("\n")

            in_products = False
            pending_qty = 1.0  # carries over from a "N x" line to the next product

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
                    # Detect standalone quantity multiplier: "3 x" or "3x"
                    qty_match = re.match(r"^(\d+)\s*[xX]\s*$", line)
                    if qty_match:
                        pending_qty = float(qty_match.group(1))
                        continue  # don't emit — apply to the next product line

                    # Typical product line: "Name    1,99 A"
                    m = re.match(r"^(.+?)\s+([-]?\d+[,\.]\d{2})\s*[A-Z]?\s*$", line)
                    if m:
                        name = m.group(1).strip()
                        price_str = m.group(2).replace(",", ".")
                        try:
                            total_price = float(price_str)
                        except ValueError:
                            pending_qty = 1.0
                            continue
                        if total_price > 0 and len(name) > 2:
                            per_item = round(total_price / pending_qty, 2)
                            items.append({
                                "raw_name": name,
                                "price": per_item,
                                "quantity": pending_qty,
                            })
                        pending_qty = 1.0  # reset after consuming
    return items

import os
import re
import pytesseract
from PIL import Image
import pdfplumber
from datetime import datetime

# Multipliers to convert any weight/volume unit to grams or ml (unified scale)
_UNIT_TO_G = {
    'kg': 1000.0, 'g': 1.0, 'gr': 1.0,
    'l': 1000.0, 'liter': 1000.0, 'ltr': 1000.0,
    'ml': 1.0, 'cl': 10.0, 'dl': 100.0,
}


def parse_weight_from_name(name: str) -> float | None:
    """Parse package weight/volume from a product name.

    Returns the value in grams (for solid) or ml (for liquid) — both share
    the same numeric scale so we store them uniformly.

    Examples:
      "GL Gouda jung HF3 SHB400g"   → 400.0
      "Capri Sun Multi 10x0,2L PK"  → 2000.0  (10 × 200 ml)
      "Milch 1,5% 1L"               → 1000.0
      "Chips 175g"                  → 175.0
      "Wasser 6x1,5L"               → 9000.0
    """
    # Pack pattern first: "10x0,2L", "6x1,5L", "3x330ml"
    pack_m = re.search(
        r'(\d+)\s*[xX]\s*(\d+(?:[,\.]\d+)?)\s*(kg|g|gr|l|liter|ltr|ml|cl|dl)\b',
        name, re.IGNORECASE,
    )
    if pack_m:
        count = float(pack_m.group(1))
        amount = float(pack_m.group(2).replace(',', '.'))
        unit = pack_m.group(3).lower()
        return count * amount * _UNIT_TO_G.get(unit, 1.0)

    # Simple pattern: "400g", "1,5L", "330 ml", "1.5kg"
    simple_m = re.search(
        r'(\d+(?:[,\.]\d+)?)\s*(kg|g|gr|l|liter|ltr|ml|cl|dl)\b',
        name, re.IGNORECASE,
    )
    if simple_m:
        amount = float(simple_m.group(1).replace(',', '.'))
        unit = simple_m.group(2).lower()
        return amount * _UNIT_TO_G.get(unit, 1.0)

    return None


def extract_netto_date(filepath: str) -> datetime | None:
    """Parse date from filename like Netto_Kassenbon_20240414-143022.pdf"""
    basename = os.path.basename(filepath)
    m = re.search(r"(\d{8})-(\d{6})", basename)
    if m:
        try:
            return datetime.strptime(m.group(1) + m.group(2), "%Y%m%d%H%M%S")
        except ValueError:
            pass
    return None


def parse_jumbo_png(filepath: str) -> list[dict]:
    """OCR a Jumbo receipt PNG and extract product lines."""
    img = Image.open(filepath)
    text = pytesseract.image_to_string(img, lang="nld+eng", config="--psm 6")
    lines = text.split("\n")

    items = []
    in_products = False
    price_pattern = re.compile(r"^(.+?)\s+(\d+[,\.]\d{2})\s*$")
    discount_pattern = re.compile(r"^(.+?)\s+(-\d+[,\.]\d{2})\s*$")
    qty_pattern = re.compile(r"^(\d+)\s*[xX]\s*(?:[\d]+[,\.][\d]{2}\s*[A-Z]?)?\s*$")
    pending_qty = 1.0

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
            # Detect quantity multiplier lines ("3 x" or "3 x  1,99")
            if qty_pattern.match(line):
                qty_m = qty_pattern.match(line)
                pending_qty = float(qty_m.group(1))
                continue
            m = price_pattern.match(line)
            if m:
                name = m.group(1).strip()
                price_str = m.group(2).replace(",", ".")
                try:
                    price = float(price_str)
                except ValueError:
                    pending_qty = 1.0
                    continue
                if len(name) > 2 and not name.upper() == name:  # filter noise
                    items.append({"raw_name": name, "price": price, "quantity": pending_qty,
                                  "parsed_weight_g": parse_weight_from_name(name)})
                pending_qty = 1.0
    return items


def parse_netto_pdf(filepath: str) -> tuple[list[dict], datetime | None]:
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
                    # Detect standalone quantity multiplier lines:
                    # "3 x", "3x", or "3 x  1,99 A" (with optional per-item price appended)
                    # These lines are NEVER actual product names.
                    qty_match = re.match(r"^(\d+)\s*[xX]\s*(?:[\d]+[,\.][\d]{2}\s*[A-Z]?)?\s*$", line)
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
                                "parsed_weight_g": parse_weight_from_name(name),
                            })
                        pending_qty = 1.0  # reset after consuming
    return items, extract_netto_date(filepath)


def parse_albert_heijn_pdf(filepath: str) -> list[dict]:
    """Extract product lines from an Albert Heijn digital receipt PDF.
    AH format: lines like "Kaas Gouda 48+ 500g   2,49" with totals section."""
    items = []
    with pdfplumber.open(filepath) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            lines = text.split("\n")
            in_products = False
            pending_qty = 1.0
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                if re.search(r"Omschrijving|Artikel|Product|Aantal", line, re.IGNORECASE):
                    in_products = True
                    continue
                if in_products and re.search(r"Totaal|Subtotaal|Wisselgeld|Pinnen|Betaald", line, re.IGNORECASE):
                    in_products = False
                    continue
                if in_products:
                    qty_match = re.match(r"^(\d+)\s*[xX]\s*(?:[\d]+[,\.][\d]{2}\s*[A-Z]?)?\s*$", line)
                    if qty_match:
                        pending_qty = float(qty_match.group(1))
                        continue
                    m = re.match(r"^(.+?)\s+([-]?\d+[,\.]\d{2})\s*$", line)
                    if m:
                        name = m.group(1).strip()
                        try:
                            total_price = float(m.group(2).replace(",", "."))
                        except ValueError:
                            pending_qty = 1.0
                            continue
                        if total_price > 0 and len(name) > 2:
                            per_item = round(total_price / pending_qty, 2)
                            items.append({"raw_name": name, "price": per_item, "quantity": pending_qty,
                                          "parsed_weight_g": parse_weight_from_name(name)})
                        pending_qty = 1.0
    return items, None


def parse_lidl_pdf(filepath: str) -> list[dict]:
    """Extract product lines from a Lidl receipt PDF.
    Lidl format is similar to Netto (German discount) with slight variations."""
    items = []
    with pdfplumber.open(filepath) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            lines = text.split("\n")
            in_products = False
            pending_qty = 1.0
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                if re.search(r"EUR|Artikel|Menge|St[üu]ck", line, re.IGNORECASE):
                    in_products = True
                    continue
                if in_products and re.search(r"Summe|Gesamt|Zu\s*zahlen|EC.Karte|Bar|SEPA", line, re.IGNORECASE):
                    in_products = False
                    continue
                if in_products:
                    qty_match = re.match(r"^(\d+)\s*[xX]\s*(?:[\d]+[,\.][\d]{2}\s*[A-Z]?)?\s*$", line)
                    if qty_match:
                        pending_qty = float(qty_match.group(1))
                        continue
                    m = re.match(r"^(.+?)\s+([-]?\d+[,\.]\d{2})\s*[A-Z]?\s*$", line)
                    if m:
                        name = m.group(1).strip()
                        try:
                            total_price = float(m.group(2).replace(",", "."))
                        except ValueError:
                            pending_qty = 1.0
                            continue
                        if total_price > 0 and len(name) > 2:
                            per_item = round(total_price / pending_qty, 2)
                            items.append({"raw_name": name, "price": per_item, "quantity": pending_qty,
                                          "parsed_weight_g": parse_weight_from_name(name)})
                        pending_qty = 1.0
    return items, None


def parse_aldi_pdf(filepath: str) -> list[dict]:
    """Extract product lines from an Aldi receipt PDF."""
    items = []
    with pdfplumber.open(filepath) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            lines = text.split("\n")
            in_products = False
            pending_qty = 1.0
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                if re.search(r"EUR|Artikel|Menge", line, re.IGNORECASE):
                    in_products = True
                    continue
                if in_products and re.search(r"Summe|Gesamt|Zu\s*zahlen|EC|Bargeld", line, re.IGNORECASE):
                    in_products = False
                    continue
                if in_products:
                    qty_match = re.match(r"^(\d+)\s*[xX]\s*(?:[\d]+[,\.][\d]{2}\s*[A-Z]?)?\s*$", line)
                    if qty_match:
                        pending_qty = float(qty_match.group(1))
                        continue
                    m = re.match(r"^(.+?)\s+([-]?\d+[,\.]\d{2})\s*[A-Z]?\s*$", line)
                    if m:
                        name = m.group(1).strip()
                        try:
                            total_price = float(m.group(2).replace(",", "."))
                        except ValueError:
                            pending_qty = 1.0
                            continue
                        if total_price > 0 and len(name) > 2:
                            per_item = round(total_price / pending_qty, 2)
                            items.append({"raw_name": name, "price": per_item, "quantity": pending_qty,
                                          "parsed_weight_g": parse_weight_from_name(name)})
                        pending_qty = 1.0
    return items, None

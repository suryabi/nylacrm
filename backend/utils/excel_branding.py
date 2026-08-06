"""Apply the Nyla brand font (Helvetica) to generated Excel workbooks."""
from openpyxl.styles import Font

BRAND_FONT = "Helvetica"


def apply_brand_font(wb, name: str = BRAND_FONT):
    """Set the brand font on every cell, preserving all other font attributes."""
    for ws in wb.worksheets:
        for row in ws.iter_rows():
            for cell in row:
                f = cell.font
                cell.font = Font(
                    name=name, size=f.size, bold=f.bold, italic=f.italic,
                    underline=f.underline, strike=f.strike, color=f.color,
                    vertAlign=f.vertAlign,
                )
    return wb

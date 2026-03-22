"""
PDF Generator for Debit/Credit Notes
Generates professional PDF documents with company and distributor details
Includes company logos, itemized breakdowns, and signature blocks
"""
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, HRFlowable
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
from reportlab.graphics.shapes import Drawing, Line
from io import BytesIO
from datetime import datetime
import logging
import requests

logger = logging.getLogger(__name__)

# Month names for display
MONTH_NAMES = {
    1: "January", 2: "February", 3: "March", 4: "April",
    5: "May", 6: "June", 7: "July", 8: "August",
    9: "September", 10: "October", 11: "November", 12: "December"
}


def fetch_logo_image(logo_url: str, max_width: float = 60, max_height: float = 40) -> Image:
    """
    Fetch and return a ReportLab Image from a URL.
    Returns None if the URL is invalid or fetch fails.
    """
    if not logo_url:
        return None
    
    try:
        response = requests.get(logo_url, timeout=10)
        response.raise_for_status()
        img_data = BytesIO(response.content)
        img = Image(img_data, width=max_width, height=max_height)
        return img
    except Exception as e:
        logger.warning(f"Failed to fetch logo from {logo_url}: {e}")
        return None


def generate_debit_credit_note_pdf(
    note_data: dict,
    company_profile: dict,
    distributor_data: dict,
    settlements: list = None,
    branding: dict = None
) -> bytes:
    """
    Generate a comprehensive PDF for a Debit or Credit Note
    
    Args:
        note_data: The note document from database
        company_profile: Company profile from tenant settings
        distributor_data: Distributor details
        settlements: List of settlements included in this note
        branding: Tenant branding info with logo_url
    
    Returns:
        PDF as bytes
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=18*mm,
        leftMargin=18*mm,
        topMargin=15*mm,
        bottomMargin=20*mm
    )
    
    # Styles
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'Title',
        parent=styles['Heading1'],
        fontSize=20,
        alignment=TA_CENTER,
        spaceAfter=5,
        textColor=colors.HexColor('#065F46')
    )
    
    subtitle_style = ParagraphStyle(
        'Subtitle',
        parent=styles['Normal'],
        fontSize=11,
        alignment=TA_CENTER,
        textColor=colors.gray
    )
    
    header_style = ParagraphStyle(
        'Header',
        parent=styles['Heading2'],
        fontSize=11,
        textColor=colors.HexColor('#065F46'),
        spaceBefore=12,
        spaceAfter=6
    )
    
    normal_style = ParagraphStyle(
        'CustomNormal',
        parent=styles['Normal'],
        fontSize=9,
        leading=12
    )
    
    small_style = ParagraphStyle(
        'Small',
        parent=styles['Normal'],
        fontSize=8,
        leading=10,
        textColor=colors.gray
    )
    
    right_style = ParagraphStyle(  # noqa: F841
        'Right',
        parent=styles['Normal'],
        fontSize=9,
        alignment=TA_RIGHT
    )
    
    center_style = ParagraphStyle(  # noqa: F841
        'Center',
        parent=styles['Normal'],
        fontSize=9,
        alignment=TA_CENTER
    )
    
    # Build document content
    story = []
    
    # Note type
    note_type = note_data.get('note_type', 'credit')
    is_credit = note_type == 'credit'
    
    # ============ HEADER WITH LOGOS ============
    company_name = company_profile.get('legal_name') or company_profile.get('trade_name') or 'Company Name'
    company_gstin = company_profile.get('gstin', '')
    company_phone = company_profile.get('company_phone', '')
    company_email = company_profile.get('company_email', '')
    company_address = company_profile.get('principal_address', {})
    
    # Build address string
    addr_parts = []
    if company_address.get('building_name'):
        addr_parts.append(company_address.get('building_name'))
    if company_address.get('road_street'):
        addr_parts.append(company_address.get('road_street'))
    if company_address.get('locality'):
        addr_parts.append(company_address.get('locality'))
    if company_address.get('city'):
        addr_parts.append(company_address.get('city'))
    if company_address.get('state'):
        addr_parts.append(company_address.get('state'))
    if company_address.get('pin_code'):
        addr_parts.append(f"PIN: {company_address.get('pin_code')}")
    company_addr_str = ', '.join(addr_parts) if addr_parts else 'Address not configured'
    
    # Try to get logo
    logo_url = branding.get('logo_url') if branding else None
    company_logo = fetch_logo_image(logo_url, max_width=80, max_height=50) if logo_url else None
    
    # Header row with logo and company info
    if company_logo:
        header_left = company_logo
    else:
        header_left = Paragraph(f"<b>{company_name}</b>", ParagraphStyle('CompanyName', parent=styles['Normal'], fontSize=14, fontName='Helvetica-Bold'))
    
    company_info_text = f"""
    <b>{company_name}</b><br/>
    {company_addr_str}<br/>
    GSTIN: {company_gstin}<br/>
    {f'Phone: {company_phone}' if company_phone else ''} {f'| Email: {company_email}' if company_email else ''}
    """
    
    header_data = [[header_left, Paragraph(company_info_text.strip(), normal_style)]]
    header_table = Table(header_data, colWidths=[100, 400])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (0, 0), (0, 0), 'LEFT'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 10))
    
    # Horizontal line
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#065F46')))
    story.append(Spacer(1, 15))
    
    # ============ TITLE ============
    title_text = "CREDIT NOTE" if is_credit else "DEBIT NOTE"
    story.append(Paragraph(title_text, title_style))
    story.append(Paragraph(f"Note No: {note_data.get('note_number', 'N/A')}", subtitle_style))
    story.append(Spacer(1, 15))
    
    # ============ NOTE DETAILS & PERIOD ============
    created_at = note_data.get('created_at', '')
    if created_at:
        try:
            dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
            created_at_str = dt.strftime('%d %B %Y')
        except Exception:
            created_at_str = created_at[:10] if len(created_at) > 10 else created_at
    else:
        created_at_str = datetime.now().strftime('%d %B %Y')
    
    month_num = note_data.get('month', 1)
    year = note_data.get('year', datetime.now().year)
    period_str = f"{MONTH_NAMES.get(month_num, str(month_num))} {year}"
    
    note_details_data = [
        ['Date:', created_at_str, 'Reconciliation Period:', period_str],
        ['Status:', note_data.get('status', 'pending').title(), 'Total Settlements:', str(note_data.get('total_settlements', 0))],
    ]
    
    note_table = Table(note_details_data, colWidths=[80, 150, 120, 130])
    note_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F9FAFB')),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.lightgrey),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(note_table)
    story.append(Spacer(1, 15))
    
    # ============ DISTRIBUTOR DETAILS ============
    story.append(Paragraph("Distributor Details", header_style))
    
    dist_name = distributor_data.get('distributor_name', 'N/A')
    dist_code = distributor_data.get('distributor_code', 'N/A')
    dist_gstin = distributor_data.get('gstin', 'N/A')
    dist_pan = distributor_data.get('pan', 'N/A')
    dist_address = distributor_data.get('billing_address') or distributor_data.get('registered_address', 'N/A')
    dist_contact = distributor_data.get('primary_contact_name', '')
    dist_phone = distributor_data.get('primary_contact_mobile', '')
    dist_email = distributor_data.get('primary_contact_email', '')
    
    dist_data = [
        ['Name:', dist_name, 'Code:', dist_code],
        ['GSTIN:', dist_gstin, 'PAN:', dist_pan],
        ['Address:', dist_address, '', ''],
        ['Contact:', f"{dist_contact} | {dist_phone}" if dist_contact else dist_phone, 'Email:', dist_email or 'N/A'],
    ]
    
    dist_table = Table(dist_data, colWidths=[55, 220, 50, 155])
    dist_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('SPAN', (1, 2), (3, 2)),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    story.append(dist_table)
    story.append(Spacer(1, 15))
    
    # ============ ITEMIZED SETTLEMENTS BREAKDOWN ============
    if settlements and len(settlements) > 0:
        story.append(Paragraph(f"Settlements Breakdown ({len(settlements)} settlements)", header_style))
        
        settlement_headers = ['#', 'Settlement No.', 'Account', 'Deliveries', 'Billing Value', 'Earnings', 'Transfer Margin', 'Adjustment']
        settlement_data = [settlement_headers]
        
        for idx, s in enumerate(settlements[:30], 1):
            account_name = s.get('account_name', 'N/A')
            if len(account_name) > 20:
                account_name = account_name[:18] + '...'
            
            settlement_data.append([
                str(idx),
                s.get('settlement_number', 'N/A'),
                account_name,
                str(s.get('total_deliveries', 0)),
                f"₹{s.get('total_billing_value', 0):,.2f}",
                f"₹{s.get('distributor_earnings', 0):,.2f}",
                f"₹{s.get('margin_at_transfer_price', 0):,.2f}",
                f"₹{s.get('adjustment_payable', 0):,.2f}"
            ])
        
        if len(settlements) > 30:
            settlement_data.append(['', f'... and {len(settlements) - 30} more settlements', '', '', '', '', '', ''])
        
        settlement_table = Table(settlement_data, colWidths=[20, 65, 90, 45, 75, 65, 70, 65])
        settlement_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#065F46')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 7),
            ('FONTSIZE', (0, 1), (-1, -1), 7),
            ('ALIGN', (0, 0), (0, -1), 'CENTER'),
            ('ALIGN', (3, 0), (-1, -1), 'RIGHT'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.lightgrey),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F9FAFB')]),
        ]))
        story.append(settlement_table)
        story.append(Spacer(1, 15))
    
    # ============ SUMMARY SECTION ============
    story.append(Paragraph("Financial Summary", header_style))
    
    amount = note_data.get('amount', 0)
    total_billing = note_data.get('total_billing_value', 0)
    total_earnings = note_data.get('total_distributor_earnings', 0)
    total_transfer_margin = note_data.get('total_margin_at_transfer', 0)
    
    summary_data = [
        ['Description', 'Amount'],
        ['Total Customer Billing Value', f"₹{total_billing:,.2f}"],
        ['Total Distributor Earnings (Commission on Billing)', f"₹{total_earnings:,.2f}"],
        ['Margin Already Accounted at Transfer Price', f"₹{total_transfer_margin:,.2f}"],
        ['Net Adjustment (Earnings - Transfer Margin)', f"₹{note_data.get('amount', 0) if is_credit else -note_data.get('amount', 0):,.2f}"],
        ['', ''],
        [f"{'CREDIT' if is_credit else 'DEBIT'} NOTE AMOUNT", f"₹{amount:,.2f}"],
    ]
    
    summary_table = Table(summary_data, colWidths=[350, 130])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#065F46')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -2), 0.5, colors.gray),
        ('LINEABOVE', (0, -1), (-1, -1), 1.5, colors.HexColor('#065F46')),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#ECFDF5') if is_credit else colors.HexColor('#FEF2F2')),
        ('TEXTCOLOR', (0, -1), (-1, -1), colors.HexColor('#065F46') if is_credit else colors.HexColor('#DC2626')),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 15))
    
    # ============ REMARKS ============
    if note_data.get('remarks'):
        story.append(Paragraph("Remarks", header_style))
        story.append(Paragraph(note_data.get('remarks'), normal_style))
        story.append(Spacer(1, 15))
    
    # ============ SIGNATURE BLOCKS ============
    story.append(Spacer(1, 20))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.lightgrey))
    story.append(Spacer(1, 20))
    
    sig_style = ParagraphStyle(
        'Signature',
        parent=styles['Normal'],
        fontSize=9,
        alignment=TA_CENTER
    )
    
    sig_data = [
        [
            Paragraph("_________________________<br/><br/><b>Prepared By</b><br/>" + 
                     (note_data.get('created_by_name', '') or ''), sig_style),
            Paragraph("_________________________<br/><br/><b>Authorized Signatory</b><br/>" + 
                     company_name, sig_style),
            Paragraph("_________________________<br/><br/><b>Distributor Acknowledgment</b><br/>" + 
                     dist_name, sig_style),
        ]
    ]
    
    sig_table = Table(sig_data, colWidths=[160, 160, 160])
    sig_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'BOTTOM'),
        ('TOPPADDING', (0, 0), (-1, -1), 30),
    ]))
    story.append(sig_table)
    story.append(Spacer(1, 20))
    
    # ============ FOOTER ============
    footer_text = f"""
    <b>Note:</b> {'This credit note represents amount payable to the distributor for the reconciliation period.' if is_credit else 'This debit note represents amount receivable from the distributor for the reconciliation period.'}
    <br/><br/>
    This is a computer-generated document. Generated on: {datetime.now().strftime('%d %B %Y at %H:%M:%S')}
    """
    story.append(Paragraph(footer_text, small_style))
    
    # Build PDF
    doc.build(story)
    
    pdf_bytes = buffer.getvalue()
    buffer.close()
    
    return pdf_bytes

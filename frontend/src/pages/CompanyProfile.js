import React from 'react';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { 
  Building2, FileText, MapPin, Users, Calendar, 
  CheckCircle2, Award, Globe, Shield, Briefcase,
  Copy, Download, CreditCard, QrCode, Landmark, BadgeCheck,
  Phone, User, ExternalLink, Navigation
} from 'lucide-react';

// Company Data
const COMPANY_DATA = {
  basicDetails: {
    gstin: '36AAFCJ4820K1ZG',
    registrationType: 'Regular',
    gstAct: 'Goods and Services Tax Act, 2017',
    registrationApprovalDate: '12/12/2025',
    validityFrom: '11/03/2022',
    certificateIssueDate: '12/12/2025'
  },
  msme: {
    registrationNumber: 'UDYAM-TS-02-0063680'
  },
  bankDetails: {
    accountName: 'Jaitra Wellness Private Limited',
    accountNumber: '50200066654575',
    ifscCode: 'HDFC0000642',
    bankName: 'HDFC Bank',
    terminalId: '82099776'
  },
  paymentQR: 'https://customer-assets.emergentagent.com/job_ca75408a-cd0b-4269-9030-efa58b12f03d/artifacts/d1wawl4p_WhatsApp%20Image%202026-02-21%20at%207.51.02%20PM.jpeg',
  businessIdentity: {
    legalName: 'JAITRA WELLNESS PRIVATE LIMITED',
    tradeName: 'JAITRA WELLNESS PRIVATE LIMITED',
    brandName: 'Nyla Air Water',
    constitution: 'Private Limited Company'
  },
  principalAddress: {
    buildingName: 'Sri Laxmi Towers',
    floor: 'Third Floor',
    unitFlatNo: 'Unit C',
    buildingPlotNo: 'Plot No. 78',
    landmark: 'Opp. Kapston Security Services',
    roadStreet: 'Kavuri Hills Phase 2 Road',
    locality: 'Madhapur',
    city: 'Hyderabad',
    district: 'Hyderabad',
    state: 'Telangana',
    pinCode: '500033',
    googleMapsUrl: 'https://maps.app.goo.gl/Av6NUVdv5vEhSsap8'
  },
  officeContact: {
    name: 'Sanju Benny',
    phone: '+91 7702 153 284',
    purpose: 'For Couriers / Parcels or directions'
  },
  directors: [
    { name: 'SURYA YADAVALLI', designation: 'Director', residentState: 'Andhra Pradesh' },
    { name: 'VAMSHI KRISHNA BOMMENA', designation: 'Director', residentState: 'Telangana' }
  ]
};

// Copy to clipboard component
const CopyButton = ({ text, label }) => {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied to clipboard`);
    } catch (err) {
      toast.error('Failed to copy');
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 text-muted-foreground hover:text-primary"
      onClick={handleCopy}
      title={`Copy ${label}`}
      data-testid={`copy-${label.toLowerCase().replace(/\s/g, '-')}`}
    >
      <Copy className="h-3.5 w-3.5" />
    </Button>
  );
};

export default function CompanyProfile() {
  const { basicDetails, msme, bankDetails, paymentQR, businessIdentity, principalAddress, officeContact, directors } = COMPANY_DATA;

  const handleDownloadQR = () => {
    const link = document.createElement('a');
    link.href = paymentQR;
    link.download = 'Jaitra-Wellness-Payment-QR.jpeg';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('QR Code download started');
  };

  const formatAccountNumber = (num) => {
    return num.replace(/(.{4})/g, '$1 ').trim();
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-8" data-testid="company-profile-page">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-primary/10 rounded-2xl">
          <Building2 className="h-10 w-10 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-semibold text-foreground">{businessIdentity.legalName}</h1>
          <p className="text-lg text-primary font-medium mt-1">{businessIdentity.brandName}</p>
        </div>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Badge className="bg-emerald-100 text-emerald-800 px-4 py-1">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
            GST Registered
          </Badge>
          <Badge className="bg-blue-100 text-blue-800 px-4 py-1">
            <BadgeCheck className="h-3.5 w-3.5 mr-1.5" />
            MSME Certified
          </Badge>
          <Badge className="bg-purple-100 text-purple-800 px-4 py-1">
            {businessIdentity.constitution}
          </Badge>
        </div>
      </div>

      {/* Quick Info Bar */}
      <Card className="p-4 bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
        <div className="flex flex-wrap items-center justify-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <span className="text-muted-foreground">GSTIN:</span>
            <span className="font-mono font-semibold text-foreground">{basicDetails.gstin}</span>
            <CopyButton text={basicDetails.gstin} label="GSTIN" />
          </div>
          <div className="h-4 w-px bg-border hidden md:block" />
          <div className="flex items-center gap-2">
            <BadgeCheck className="h-4 w-4 text-primary" />
            <span className="text-muted-foreground">MSME:</span>
            <span className="font-mono font-semibold text-foreground">{msme.registrationNumber}</span>
            <CopyButton text={msme.registrationNumber} label="MSME" />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* GST Registration Details */}
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <FileText className="h-5 w-5" />
              GST Registration Details
            </h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 gap-4">
              <div className="flex justify-between items-center py-3 border-b border-dashed">
                <span className="text-muted-foreground text-sm">GSTIN</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-lg text-foreground tracking-wider">
                    {basicDetails.gstin}
                  </span>
                  <CopyButton text={basicDetails.gstin} label="GSTIN" />
                </div>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-dashed">
                <span className="text-muted-foreground text-sm">Registration Type</span>
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                  {basicDetails.registrationType}
                </Badge>
              </div>
              <div className="flex justify-between items-start py-3 border-b border-dashed">
                <span className="text-muted-foreground text-sm">GST Act</span>
                <span className="font-medium text-foreground text-right text-sm max-w-[60%]">
                  {basicDetails.gstAct}
                </span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-dashed">
                <span className="text-muted-foreground text-sm">Registration Approval</span>
                <span className="font-medium text-foreground">{basicDetails.registrationApprovalDate}</span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-dashed">
                <span className="text-muted-foreground text-sm">Validity From</span>
                <span className="font-medium text-foreground">{basicDetails.validityFrom}</span>
              </div>
              <div className="flex justify-between items-center py-3">
                <span className="text-muted-foreground text-sm">Certificate Issue Date</span>
                <span className="font-medium text-foreground">{basicDetails.certificateIssueDate}</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Business Identity */}
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Business Identity
            </h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="space-y-4">
              <div className="py-3 border-b border-dashed">
                <span className="text-muted-foreground text-sm block mb-1">Legal Name</span>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">{businessIdentity.legalName}</span>
                  <CopyButton text={businessIdentity.legalName} label="Legal Name" />
                </div>
              </div>
              <div className="py-3 border-b border-dashed">
                <span className="text-muted-foreground text-sm block mb-1">Trade Name</span>
                <span className="font-medium text-foreground">{businessIdentity.tradeName}</span>
              </div>
              <div className="py-3 border-b border-dashed">
                <span className="text-muted-foreground text-sm block mb-1">Brand Name</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-primary text-lg">{businessIdentity.brandName}</span>
                  <Badge className="bg-primary/10 text-primary">Brand</Badge>
                </div>
              </div>
              <div className="py-3 border-b border-dashed">
                <span className="text-muted-foreground text-sm block mb-1">MSME Registration</span>
                <div className="flex items-center justify-between">
                  <span className="font-mono font-semibold text-foreground">{msme.registrationNumber}</span>
                  <CopyButton text={msme.registrationNumber} label="MSME Number" />
                </div>
              </div>
              <div className="py-3">
                <span className="text-muted-foreground text-sm block mb-1">Constitution of Business</span>
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-blue-500" />
                  <span className="font-medium text-foreground">{businessIdentity.constitution}</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Bank Account & Payment QR */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bank Account Details */}
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 px-6 py-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Landmark className="h-5 w-5" />
              Bank Account Details
            </h2>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              <div className="py-3 border-b border-dashed">
                <span className="text-muted-foreground text-sm block mb-1">Account Name</span>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">{bankDetails.accountName}</span>
                  <CopyButton text={bankDetails.accountName} label="Account Name" />
                </div>
              </div>
              <div className="py-3 border-b border-dashed">
                <span className="text-muted-foreground text-sm block mb-1">Account Number</span>
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-xl text-foreground tracking-wider">
                    {formatAccountNumber(bankDetails.accountNumber)}
                  </span>
                  <CopyButton text={bankDetails.accountNumber} label="Account Number" />
                </div>
              </div>
              <div className="py-3 border-b border-dashed">
                <span className="text-muted-foreground text-sm block mb-1">IFSC Code</span>
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-lg text-foreground">{bankDetails.ifscCode}</span>
                  <CopyButton text={bankDetails.ifscCode} label="IFSC Code" />
                </div>
              </div>
              <div className="py-3">
                <span className="text-muted-foreground text-sm block mb-1">Bank</span>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-blue-900 rounded flex items-center justify-center">
                    <span className="text-white text-xs font-bold">HDFC</span>
                  </div>
                  <span className="font-medium text-foreground">{bankDetails.bankName}</span>
                </div>
              </div>
            </div>

            {/* Copy All Button */}
            <Button
              variant="outline"
              className="w-full mt-4"
              onClick={() => {
                const text = `Account Name: ${bankDetails.accountName}\nAccount Number: ${bankDetails.accountNumber}\nIFSC Code: ${bankDetails.ifscCode}\nBank: ${bankDetails.bankName}`;
                navigator.clipboard.writeText(text);
                toast.success('Bank details copied to clipboard');
              }}
              data-testid="copy-all-bank-details"
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy All Bank Details
            </Button>
          </div>
        </Card>

        {/* Payment QR Code */}
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-r from-violet-500 to-purple-600 px-6 py-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              Payment QR Code
            </h2>
            <p className="text-violet-100 text-sm mt-1">HDFC SmartHub Vyapar</p>
          </div>
          <div className="p-6">
            <div className="bg-white rounded-xl p-4 border-2 border-dashed border-violet-200">
              <img 
                src={paymentQR} 
                alt="Payment QR Code" 
                className="w-full max-w-[280px] mx-auto rounded-lg"
              />
            </div>
            <div className="mt-4 text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <span className="text-muted-foreground text-sm">Terminal ID:</span>
                <span className="font-mono font-bold text-foreground">{bankDetails.terminalId}</span>
                <CopyButton text={bankDetails.terminalId} label="Terminal ID" />
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Scan & Pay using GPay, PhonePe, Paytm, or any UPI app
              </p>
              <Button 
                onClick={handleDownloadQR}
                className="bg-violet-600 hover:bg-violet-700"
                data-testid="download-qr-btn"
              >
                <Download className="h-4 w-4 mr-2" />
                Download QR Code
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Principal Place of Business */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Principal Place of Business
          </h2>
          <p className="text-amber-100 text-sm mt-1">Corporate Address</p>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Full Address Card */}
            <div className="md:col-span-2 lg:col-span-1 bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-5 border border-amber-200">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <MapPin className="h-5 w-5 text-amber-600" />
                </div>
                <div className="text-sm leading-relaxed flex-1">
                  <p className="font-medium text-foreground">{principalAddress.floor}, {principalAddress.unitFlatNo}</p>
                  <p className="text-foreground">{principalAddress.buildingPlotNo}</p>
                  <p className="text-foreground">{principalAddress.roadStreet}</p>
                  <p className="text-foreground">{principalAddress.locality}</p>
                  <p className="font-medium text-foreground mt-2">
                    {principalAddress.city}, {principalAddress.state} - {principalAddress.pinCode}
                  </p>
                </div>
                <CopyButton 
                  text={`${principalAddress.floor}, ${principalAddress.unitFlatNo}, ${principalAddress.buildingPlotNo}, ${principalAddress.roadStreet}, ${principalAddress.locality}, ${principalAddress.city}, ${principalAddress.state} - ${principalAddress.pinCode}`} 
                  label="Address" 
                />
              </div>
            </div>

            {/* Address Components */}
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-dashed">
                <span className="text-muted-foreground text-sm">Floor</span>
                <span className="font-medium text-foreground text-sm">{principalAddress.floor}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-dashed">
                <span className="text-muted-foreground text-sm">Unit / Flat No.</span>
                <span className="font-medium text-foreground text-sm">{principalAddress.unitFlatNo}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-dashed">
                <span className="text-muted-foreground text-sm">Building / Plot No.</span>
                <span className="font-medium text-foreground text-sm">{principalAddress.buildingPlotNo}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-muted-foreground text-sm">Road / Street</span>
                <span className="font-medium text-foreground text-sm text-right max-w-[50%]">{principalAddress.roadStreet}</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-dashed">
                <span className="text-muted-foreground text-sm">Locality</span>
                <span className="font-medium text-foreground text-sm">{principalAddress.locality}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-dashed">
                <span className="text-muted-foreground text-sm">City</span>
                <span className="font-medium text-foreground text-sm">{principalAddress.city}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-dashed">
                <span className="text-muted-foreground text-sm">District</span>
                <span className="font-medium text-foreground text-sm">{principalAddress.district}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-dashed">
                <span className="text-muted-foreground text-sm">State</span>
                <span className="font-medium text-foreground text-sm">{principalAddress.state}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-muted-foreground text-sm">PIN Code</span>
                <div className="flex items-center gap-1">
                  <span className="font-mono font-semibold text-foreground">{principalAddress.pinCode}</span>
                  <CopyButton text={principalAddress.pinCode} label="PIN Code" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Key Managerial Personnel / Directors */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-purple-500 to-violet-600 px-6 py-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Users className="h-5 w-5" />
            Key Managerial Personnel / Directors
          </h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {directors.map((director, index) => (
              <div 
                key={index}
                className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl p-5 border border-purple-200"
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                      <span className="text-lg font-bold text-purple-600">
                        {director.name.charAt(0)}
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground truncate">{director.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge className="bg-purple-100 text-purple-700">
                        {director.designation}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2 text-sm text-muted-foreground">
                      <Globe className="h-3.5 w-3.5" />
                      <span>Resident State: <span className="text-foreground font-medium">{director.residentState}</span></span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Footer Note */}
      <div className="text-center text-sm text-muted-foreground bg-muted/30 rounded-xl p-4">
        <p>
          This information is based on GST Registration Certificate issued on <strong>{basicDetails.certificateIssueDate}</strong>
        </p>
        <p className="mt-1">
          For any discrepancies, please contact the GST department or update via the GST portal.
        </p>
      </div>
    </div>
  );
}

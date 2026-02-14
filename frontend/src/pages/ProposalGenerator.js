import React from 'react';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { Download, FileText, Printer } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

const CATEGORIES = [
  'Restaurant',
  'Café',
  'Star Hotel',
  'Bar & Kitchen',
  'Corporate',
  'Wellness Center',
  'Premium Club'
];

const DEFAULT_TEMPLATES = {
  'Restaurant': `<h1>Business Proposal for [Restaurant Name]</h1>
<h2>Nyla Air Water - Premium Water Solutions</h2>

<p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>

<h3>Executive Summary</h3>
<p>We are pleased to present our proposal to provide premium bottled water solutions for your esteemed restaurant. Nyla Air Water offers sustainably sourced, mineral-enriched water that complements your fine dining experience.</p>

<h3>Product Offerings</h3>
<ul>
<li><strong>660 ml Silver</strong> - Premium still water for table service</li>
<li><strong>330 ml Silver</strong> - Ideal for quick service and takeaway</li>
<li><strong>660 ml Sparkling</strong> - Perfect for cocktails and beverages</li>
<li><strong>24 Brand</strong> - White-label option with your branding</li>
</ul>

<h3>Pricing & Volume Discounts</h3>
<p>We offer competitive pricing with volume-based discounts:</p>
<ul>
<li>500-1000 bottles/month: Standard pricing</li>
<li>1000-5000 bottles/month: 10% discount</li>
<li>5000+ bottles/month: 15% discount</li>
</ul>

<h3>Delivery & Logistics</h3>
<p>Free delivery within city limits. Scheduled weekly deliveries to ensure freshness and availability.</p>

<h3>Next Steps</h3>
<p>We would be delighted to arrange a product tasting session at your convenience. Please contact us to discuss further.</p>

<p><strong>Contact:</strong><br/>
Nyla Air Water Sales Team<br/>
Email: sales@nylaairwater.earth<br/>
Phone: +91 98765 43210</p>`,

  'Café': `<h1>Partnership Proposal - [Café Name]</h1>
<h2>Nyla Air Water</h2>

<p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>

<h3>Introduction</h3>
<p>Nyla Air Water is excited to propose a partnership with your café to provide premium bottled water that aligns with your brand values.</p>

<h3>Recommended Products</h3>
<ul>
<li><strong>330 ml Silver</strong> - Perfect size for café customers</li>
<li><strong>330 ml Sparkling</strong> - Great addition to your beverage menu</li>
<li><strong>24 Brand</strong> - Custom branded bottles for your café</li>
</ul>

<h3>Benefits for Your Café</h3>
<ul>
<li>Premium product positioning</li>
<li>Sustainable sourcing story to share with customers</li>
<li>Flexible delivery schedule</li>
<li>Competitive wholesale pricing</li>
</ul>

<h3>Pricing Structure</h3>
<p>Wholesale pricing available upon request. Volume discounts for regular orders.</p>

<p><strong>Let's Connect:</strong><br/>
We'd love to schedule a tasting session and discuss partnership opportunities.</p>`,

  'Star Hotel': `<h1>Premium Water Solutions Proposal</h1>
<h2>For [Hotel Name]</h2>

<p><strong>Presented by:</strong> Nyla Air Water<br/>
<strong>Date:</strong> ${new Date().toLocaleDateString()}</p>

<h3>Introduction</h3>
<p>Nyla Air Water is honored to present our premium water solutions tailored for luxury hospitality. Our products align with your commitment to excellence and guest satisfaction.</p>

<h3>Product Portfolio for Hotels</h3>
<ol>
<li><strong>660 ml Gold</strong> - Premium rooms and suites</li>
<li><strong>330 ml Gold</strong> - Guest amenities and turndown service</li>
<li><strong>660 ml Sparkling</strong> - Mini-bar and room service</li>
<li><strong>24 Brand</strong> - Custom branded water with your hotel logo</li>
</ol>

<h3>White-Label Branding</h3>
<p>Our 24 Brand allows you to offer premium water with your hotel's branding, creating a memorable guest experience and brand consistency.</p>

<h3>Service Commitment</h3>
<ul>
<li>Dedicated account manager</li>
<li>Daily delivery options</li>
<li>Quality assurance</li>
<li>Flexible payment terms</li>
</ul>

<h3>Investment & Pricing</h3>
<p>Customized pricing based on room count and monthly volume. Special rates for long-term contracts.</p>

<p><strong>Next Steps:</strong><br/>
Schedule a presentation with your F&B team and procurement manager.</p>`
};

export default function ProposalGenerator() {
  const [selectedCategory, setSelectedCategory] = React.useState('');
  const [content, setContent] = React.useState('');
  const editorRef = React.useRef(null);

  React.useEffect(() => {
    if (selectedCategory && DEFAULT_TEMPLATES[selectedCategory]) {
      setContent(DEFAULT_TEMPLATES[selectedCategory]);
    }
  }, [selectedCategory]);

  const exportToPDF = () => {
    if (!content.trim()) {
      toast.error('No content to export');
      return;
    }
    
    // Use browser print to PDF
    const printWindow = window.open('', '', 'width=800,height=600');
    printWindow.document.write(`
      <html>
        <head>
          <title>Proposal - ${selectedCategory}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; line-height: 1.6; }
            h1 { color: #2d5a4d; border-bottom: 3px solid #2d5a4d; padding-bottom: 10px; }
            h2 { color: #4a7c6f; margin-top: 30px; }
            h3 { color: #2d5a4d; margin-top: 25px; }
            ul, ol { margin-left: 20px; }
            p { margin: 10px 0; }
          </style>
        </head>
        <body>${content}</body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 250);
    toast.success('Opening print dialog...');
  };

  const exportToWord = () => {
    if (!content.trim()) {
      toast.error('No content to export');
      return;
    }
    
    // Simple HTML to DOCX export
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Proposal</title>
        </head>
        <body>${content}</body>
      </html>
    `;
    
    const blob = new Blob([htmlContent], { type: 'application/msword' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Nyla-Proposal-${selectedCategory}-${Date.now()}.doc`;
    a.click();
    toast.success('Word document downloaded!');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-light mb-2">Proposal Generator</h1>
        <p className="text-muted-foreground">Create professional proposals using category templates</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Category Selection */}
        <Card className="p-6 border rounded-2xl">
          <h2 className="text-lg font-semibold mb-4">1. Select Category</h2>
          <div className="space-y-3">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`w-full p-3 rounded-xl text-left transition-all ${
                  selectedCategory === cat
                    ? 'bg-primary text-white'
                    : 'bg-secondary hover:bg-secondary/80'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </Card>

        {/* Editor & Export */}
        <Card className="p-6 border rounded-2xl lg:col-span-2">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">2. Edit & Export</h2>
            <div className="flex gap-2">
              <Button onClick={exportToPDF} variant="outline" size="sm" className="rounded-full">
                <Printer className="h-4 w-4 mr-2" />PDF
              </Button>
              <Button onClick={exportToWord} variant="outline" size="sm" className="rounded-full">
                <Download className="h-4 w-4 mr-2" />Word
              </Button>
            </div>
          </div>

          {!selectedCategory ? (
            <div className="text-center py-16 border-2 border-dashed rounded-xl">
              <FileText className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Select a category to load the proposal template</p>
            </div>
          ) : (
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={(e) => setContent(e.currentTarget.innerHTML)}
              dangerouslySetInnerHTML={{ __html: content }}
              className="min-h-[600px] p-6 border-2 rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
              style={{
                lineHeight: '1.8',
                fontSize: '14px'
              }}
            />
          )}

          {selectedCategory && (
            <div className="mt-4 flex gap-3">
              <Button onClick={() => setSelectedCategory('')} variant="outline" className="rounded-full">
                Clear
              </Button>
              <Button onClick={exportToPDF} className="rounded-full flex-1">
                <Printer className="h-4 w-4 mr-2" />
                Export to PDF
              </Button>
              <Button onClick={exportToWord} variant="outline" className="rounded-full flex-1">
                <Download className="h-4 w-4 mr-2" />
                Export to Word
              </Button>
            </div>
          )}
        </Card>
      </div>

      <Card className="p-6 bg-primary/5 border-primary/20 rounded-2xl">
        <h3 className="font-semibold mb-3">How to Use:</h3>
        <ol className="text-sm text-muted-foreground space-y-2">
          <li>1. Select a category from the left (Restaurant, Café, Hotel, etc.)</li>
          <li>2. Template loads automatically in the editor</li>
          <li>3. Edit the content - replace [placeholders] with actual details</li>
          <li>4. Use formatting (bold, headings, lists) as needed</li>
          <li>5. Click "Export to PDF" or "Export to Word"</li>
          <li>6. Share the professional proposal with your client!</li>
        </ol>
      </Card>
    </div>
  );
}

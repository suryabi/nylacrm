import React from 'react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { Download, Printer, Bold, Italic, List, ListOrdered, Heading1, Heading2 } from 'lucide-react';

const DEFAULT_TEMPLATES = {
  'Restaurant': `<h1>Business Proposal for [Restaurant Name]</h1>
<h2>Nyla Air Water - Premium Water Solutions</h2>
<p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
<h3>Executive Summary</h3>
<p>We are pleased to present our proposal to provide premium bottled water solutions for your esteemed restaurant.</p>
<h3>Product Offerings</h3>
<ul>
<li><strong>660 ml Silver</strong> - Premium still water for table service</li>
<li><strong>330 ml Silver</strong> - Ideal for quick service</li>
<li><strong>660 ml Sparkling</strong> - Perfect for cocktails</li>
</ul>
<h3>Pricing</h3>
<p>Competitive pricing with volume discounts available.</p>`,

  'Café': `<h1>Partnership Proposal - [Café Name]</h1>
<h2>Nyla Air Water</h2>
<p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
<h3>Introduction</h3>
<p>Nyla Air Water is excited to propose a partnership with your café.</p>
<h3>Products</h3>
<ul>
<li><strong>330 ml Silver</strong> - Perfect for café customers</li>
<li><strong>24 Brand</strong> - Custom branded bottles</li>
</ul>`,

  'Star Hotel': `<h1>Premium Water Solutions</h1>
<h2>For [Hotel Name]</h2>
<p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
<h3>Introduction</h3>
<p>Nyla Air Water presents premium water solutions for luxury hospitality.</p>
<h3>Product Portfolio</h3>
<ol>
<li><strong>660 ml Gold</strong> - Premium rooms</li>
<li><strong>24 Brand</strong> - Custom branded water</li>
</ol>`
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

  const formatText = (command, value = null) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
  };

  const exportToPDF = () => {
    if (!content.trim()) {
      toast.error('No content to export');
      return;
    }
    
    const printWindow = window.open('', '', 'width=800,height=600');
    printWindow.document.write(`
      <html>
        <head>
          <title>Proposal - ${selectedCategory}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; line-height: 1.6; }
            h1 { color: #2d5a4d; border-bottom: 3px solid #2d5a4d; }
            h2, h3 { color: #4a7c6f; margin-top: 20px; }
            ul, ol { margin-left: 20px; }
          </style>
        </head>
        <body>${content}</body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 250);
  };

  const exportToWord = () => {
    if (!content.trim()) {
      toast.error('No content');
      return;
    }
    
    const blob = new Blob([`<!DOCTYPE html><html><body>${content}</body></html>`], 
      { type: 'application/msword' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Proposal-${selectedCategory}-${Date.now()}.doc`;
    a.click();
    toast.success('Downloaded!');
  };

  return (
    <div className="space-y-6">
      <h1 className="text-4xl font-light">Proposal Generator</h1>

      <div className="grid lg:grid-cols-4 gap-6">
        <Card className="p-6 border rounded-2xl">
          <h2 className="font-semibold mb-4">Select Category</h2>
          <div className="space-y-2">
            {Object.keys(DEFAULT_TEMPLATES).map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`w-full p-3 rounded-xl text-left ${
                  selectedCategory === cat ? 'bg-primary text-white' : 'bg-secondary hover:bg-secondary/80'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-6 border rounded-2xl lg:col-span-3">
          <div className="flex justify-between mb-4">
            <h2 className="font-semibold">Edit Proposal</h2>
            <div className="flex gap-2">
              <Button onClick={exportToPDF} size="sm" className="rounded-full">
                <Printer className="h-4 w-4 mr-2" />PDF
              </Button>
              <Button onClick={exportToWord} variant="outline" size="sm" className="rounded-full">
                <Download className="h-4 w-4 mr-2" />Word
              </Button>
            </div>
          </div>

          {selectedCategory && (
            <>
              <div className="flex gap-2 mb-4 p-2 bg-secondary rounded-lg">
                <Button onClick={() => formatText('bold')} variant="ghost" size="sm" title="Bold">
                  <Bold className="h-4 w-4" />
                </Button>
                <Button onClick={() => formatText('italic')} variant="ghost" size="sm" title="Italic">
                  <Italic className="h-4 w-4" />
                </Button>
                <Button onClick={() => formatText('formatBlock', '<h1>')} variant="ghost" size="sm" title="Heading 1">
                  <Heading1 className="h-4 w-4" />
                </Button>
                <Button onClick={() => formatText('formatBlock', '<h2>')} variant="ghost" size="sm" title="Heading 2">
                  <Heading2 className="h-4 w-4" />
                </Button>
                <Button onClick={() => formatText('insertUnorderedList')} variant="ghost" size="sm" title="Bullet List">
                  <List className="h-4 w-4" />
                </Button>
                <Button onClick={() => formatText('insertOrderedList')} variant="ghost" size="sm" title="Numbered List">
                  <ListOrdered className="h-4 w-4" />
                </Button>
              </div>

              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={(e) => setContent(e.currentTarget.innerHTML)}
                dangerouslySetInnerHTML={{ __html: content }}
                className="min-h-[500px] p-8 border-2 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 prose max-w-none"
              />
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTenantConfig } from '../context/TenantConfigContext';
import { Button } from '../components/ui/button';
import { ScrollArea } from '../components/ui/scroll-area';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { 
  MessageCircle, X, Send, Bot, User, Loader2, 
  ChevronRight, ChevronLeft, Trash2, Sparkles,
  Droplets
} from 'lucide-react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function AISalesAssistant() {
  const { user } = useAuth();
  const { tenantConfig } = useTenantConfig();
  const [isOpen, setIsOpen] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const assistantName = tenantConfig?.branding?.app_name 
    ? `${tenantConfig.branding.app_name.split(' ')[0]} Sales Assistant`
    : 'NYLA Sales Assistant';

  // Check if AI assistant is available for this user
  useEffect(() => {
    const checkAvailability = async () => {
      if (!user) return;
      
      try {
        const response = await axios.get(`${API_URL}/api/ai/status`);
        setIsAvailable(response.data.available);
        if (response.data.available) {
          loadChatHistory();
        }
      } catch (error) {
        console.error('AI status check error:', error);
        setIsAvailable(false);
      }
    };
    
    checkAvailability();
  }, [user]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 150) + 'px';
    }
  }, [inputMessage]);

  const loadChatHistory = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/ai/chat/history?limit=20`);
      
      const history = response.data.history || [];
      if (history.length > 0) {
        const formattedMessages = [];
        history.reverse().forEach(item => {
          formattedMessages.push({
            role: 'user',
            content: item.message,
            timestamp: item.created_at
          });
          formattedMessages.push({
            role: 'assistant',
            content: item.response,
            timestamp: item.created_at,
            context: item.context_summary
          });
        });
        setMessages(formattedMessages);
        setSessionId(history[history.length - 1]?.session_id);
      } else {
        addWelcomeMessage();
      }
    } catch (error) {
      console.error('Failed to load chat history:', error);
      addWelcomeMessage();
    }
  };

  const addWelcomeMessage = () => {
    setMessages([{
      role: 'assistant',
      content: `Hello ${user?.name?.split(' ')[0] || 'there'}! I'm your Sales Assistant. I can help you with:

• **Leads & Pipeline** - "Show leads in Hyderabad with contacted status"
• **Accounts & Customers** - "What's the outstanding balance from Goa accounts?"
• **Revenue & Invoices** - "What was the revenue in April?"
• **Team Performance** - "Show me top performing sales reps"

What would you like to know?`,
      timestamp: new Date().toISOString()
    }]);
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;
    
    const userMessage = {
      role: 'user',
      content: inputMessage,
      timestamp: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    
    try {
      const response = await axios.post(
        `${API_URL}/api/ai/chat`,
        { message: inputMessage, session_id: sessionId }
      );
      
      setSessionId(response.data.session_id);
      
      const assistantMessage = {
        role: 'assistant',
        content: response.data.response,
        timestamp: new Date().toISOString(),
        context: response.data.data_context
      };
      
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage = error.response?.data?.detail || 'Failed to get response';
      toast.error(errorMessage);
      setMessages(prev => prev.slice(0, -1));
      setInputMessage(userMessage.content);
    } finally {
      setIsLoading(false);
    }
  };

  const clearHistory = async () => {
    try {
      await axios.delete(`${API_URL}/api/ai/chat/history`);
      setMessages([]);
      setSessionId(null);
      addWelcomeMessage();
      toast.success('Chat history cleared');
    } catch (error) {
      toast.error('Failed to clear history');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Don't render if not available
  if (!isAvailable) return null;

  return (
    <>
      {/* Toggle Button - Fixed on right edge */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed top-1/2 -translate-y-1/2 z-50 h-32 w-8 bg-gradient-to-b from-blue-600 to-purple-600 text-white rounded-l-lg shadow-lg hover:shadow-xl transition-all duration-300 flex flex-col items-center justify-center gap-1 ${
          isOpen ? 'right-[420px]' : 'right-0'
        }`}
        data-testid="ai-assistant-toggle"
      >
        {isOpen ? (
          <ChevronRight className="w-5 h-5" />
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            <span className="writing-mode-vertical text-xs font-medium" style={{ writingMode: 'vertical-rl' }}>
              AI Assistant
            </span>
          </>
        )}
      </button>

      {/* Side Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-[420px] bg-white dark:bg-gray-900 shadow-2xl z-40 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        data-testid="ai-assistant-panel"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-blue-600 to-purple-600 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <Droplets className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-lg">{assistantName}</h2>
              <p className="text-xs text-white/80">Ask anything about your data</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-white hover:bg-white/20"
              onClick={clearHistory}
              title="Clear history"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-white hover:bg-white/20"
              onClick={() => setIsOpen(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Messages Area */}
        <ScrollArea className="h-[calc(100vh-180px)] p-4">
          <div className="space-y-4">
            {messages.map((msg, index) => (
              <div 
                key={index} 
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`flex gap-2 max-w-[90%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    msg.role === 'user' 
                      ? 'bg-blue-500 text-white' 
                      : 'bg-gradient-to-br from-blue-100 to-purple-100 text-purple-600'
                  }`}>
                    {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>
                  <div className={`rounded-2xl p-4 ${
                    msg.role === 'user' 
                      ? 'bg-blue-500 text-white' 
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
                  }`}>
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      {msg.content.split('\n').map((line, i) => (
                        <p key={i} className="mb-1 last:mb-0 text-sm leading-relaxed">
                          <span dangerouslySetInnerHTML={{ 
                            __html: line
                              .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                              .replace(/₹([\d,]+\.?\d*)/g, '<span class="font-mono text-green-600 dark:text-green-400">₹$1</span>')
                          }} />
                        </p>
                      ))}
                    </div>
                    {msg.context && msg.context.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-gray-200 dark:border-gray-700 flex flex-wrap gap-1">
                        {msg.context.map((ctx, i) => (
                          <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-300">
                            {ctx}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            
            {isLoading && (
              <div className="flex justify-start">
                <div className="flex gap-2 max-w-[90%]">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-100 to-purple-100 text-purple-600 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl p-4">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                      <span className="text-sm text-gray-500">Analyzing your data...</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t bg-white dark:bg-gray-900">
          <div className="flex gap-2 items-end">
            <Textarea
              ref={textareaRef}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask about leads, revenue, accounts, team..."
              disabled={isLoading}
              className="flex-1 min-h-[60px] max-h-[150px] resize-none text-base"
              rows={2}
              data-testid="ai-assistant-input"
            />
            <Button 
              onClick={sendMessage} 
              disabled={isLoading || !inputMessage.trim()}
              className="h-[60px] px-6 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              data-testid="ai-assistant-send"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </Button>
          </div>
          <p className="text-xs text-gray-400 mt-2 text-center">
            Press Enter to send • Shift+Enter for new line
          </p>
        </div>
      </div>
    </>
  );
}

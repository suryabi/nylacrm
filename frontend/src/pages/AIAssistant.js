import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { ScrollArea } from '../components/ui/scroll-area';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { 
  Bot, User, Send, Loader2, Trash2, Sparkles,
  MessageSquare, Database, Users, Target, TrendingUp,
  HelpCircle, Lightbulb
} from 'lucide-react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Sample questions to help users get started
const SAMPLE_QUESTIONS = [
  { icon: Users, text: "How many leads do I have?", category: "Leads" },
  { icon: Target, text: "Show me my team's performance", category: "Team" },
  { icon: TrendingUp, text: "What's our sales pipeline status?", category: "Sales" },
  { icon: Database, text: "Give me an overview of accounts", category: "Accounts" },
  { icon: MessageSquare, text: "What activities happened today?", category: "Activities" },
  { icon: Lightbulb, text: "What should I focus on this week?", category: "Insights" },
];

export default function AIAssistant() {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [isAvailable, setIsAvailable] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const messagesEndRef = useRef(null);

  // Check availability
  useEffect(() => {
    const checkAvailability = async () => {
      if (!user) return;
      
      try {
        const response = await axios.get(`${API_URL}/api/ai/status`, {
          
        });
        setIsAvailable(response.data.available);
        setStatusMessage(response.data.message);
        
        if (response.data.available) {
          loadChatHistory();
        }
      } catch (error) {
        setIsAvailable(false);
        setStatusMessage('Failed to check AI assistant availability');
      }
    };
    
    checkAvailability();
  }, [user]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadChatHistory = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/ai/chat/history?limit=50`, {
        
      });
      
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
      content: `Hello ${user?.name || 'there'}! I'm your AI assistant powered by Gemini. I have access to your CRM data and can help you with:

• **Lead Analysis** - Status, counts, trends, and owner breakdown
• **Account Insights** - Customer data and recent activity
• **Team Performance** - Sales rep metrics and activity
• **Sales Targets** - Progress and forecasts
• **Activity Overview** - Calls, meetings, and follow-ups

Ask me anything about your business data!`,
      timestamp: new Date().toISOString()
    }]);
  };

  const sendMessage = async (message = inputMessage) => {
    if (!message.trim() || isLoading) return;
    
    const userMessage = {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);
    
    try {
      const response = await axios.post(
        `${API_URL}/api/ai/chat`,
        { message, session_id: sessionId },
        {  }
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
      toast.error(error.response?.data?.detail || 'Failed to get response');
      setMessages(prev => prev.slice(0, -1));
      setInputMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  const clearHistory = async () => {
    try {
      await axios.delete(`${API_URL}/api/ai/chat/history`, {
        
      });
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

  // Not available state
  if (isAvailable === false) {
    return (
      <div className="p-6" data-testid="ai-assistant-page">
        <Card className="max-w-2xl mx-auto">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Bot className="w-8 h-8 text-gray-400" />
            </div>
            <CardTitle>AI Assistant Not Available</CardTitle>
            <CardDescription>{statusMessage}</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground">
              The AI Assistant is currently available only to CEO, Director, and System Admin roles.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading state
  if (isAvailable === null) {
    return (
      <div className="p-6 flex items-center justify-center" data-testid="ai-assistant-loading">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="p-6 h-[calc(100vh-4rem)]" data-testid="ai-assistant-page">
      <div className="max-w-5xl mx-auto h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">AI Assistant</h1>
              <p className="text-sm text-muted-foreground">Powered by Gemini - Ask anything about your CRM data</p>
            </div>
          </div>
          <Button 
            variant="outline" 
            onClick={clearHistory}
            className="gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Clear History
          </Button>
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-4 min-h-0">
          {/* Chat Section */}
          <Card className="lg:col-span-3 flex flex-col min-h-0">
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {messages.map((msg, index) => (
                  <div 
                    key={index} 
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`flex gap-3 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                        msg.role === 'user' 
                          ? 'bg-blue-500 text-white' 
                          : 'bg-gradient-to-r from-purple-600 to-blue-600 text-white'
                      }`}>
                        {msg.role === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                      </div>
                      <div className={`rounded-xl p-4 ${
                        msg.role === 'user' 
                          ? 'bg-blue-500 text-white' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        <div className="prose prose-sm max-w-none">
                          {msg.content.split('\n').map((line, i) => (
                            <p key={i} className="mb-1 last:mb-0">
                              {line.startsWith('•') || line.startsWith('-') || line.startsWith('*') ? (
                                <span dangerouslySetInnerHTML={{ 
                                  __html: line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') 
                                }} />
                              ) : (
                                <span dangerouslySetInnerHTML={{ 
                                  __html: line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') 
                                }} />
                              )}
                            </p>
                          ))}
                        </div>
                        {msg.context && msg.context.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-gray-200 flex flex-wrap gap-1">
                            <Database className="w-3 h-3 text-gray-400 mt-0.5" />
                            {msg.context.map((ctx, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">
                                {ctx}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="flex gap-3 max-w-[85%]">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 text-white flex items-center justify-center flex-shrink-0">
                        <Bot className="w-5 h-5" />
                      </div>
                      <div className="bg-gray-100 rounded-xl p-4">
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
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
            <div className="p-4 border-t">
              <div className="flex gap-3">
                <Input
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask about leads, accounts, team performance, sales targets..."
                  disabled={isLoading}
                  className="flex-1 h-12"
                  data-testid="ai-assistant-input"
                />
                <Button 
                  onClick={() => sendMessage()} 
                  disabled={isLoading || !inputMessage.trim()}
                  className="h-12 px-6 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                  data-testid="ai-assistant-send-btn"
                >
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </Button>
              </div>
            </div>
          </Card>

          {/* Sidebar - Sample Questions */}
          <Card className="hidden lg:block">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <HelpCircle className="w-4 h-4" />
                Sample Questions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {SAMPLE_QUESTIONS.map((q, index) => (
                <button
                  key={index}
                  onClick={() => sendMessage(q.text)}
                  disabled={isLoading}
                  className="w-full text-left p-3 rounded-lg border hover:bg-gray-50 transition-colors group disabled:opacity-50"
                >
                  <div className="flex items-start gap-2">
                    <q.icon className="w-4 h-4 mt-0.5 text-purple-600 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium group-hover:text-purple-600 transition-colors">
                        {q.text}
                      </p>
                      <Badge variant="outline" className="mt-1 text-xs">
                        {q.category}
                      </Badge>
                    </div>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

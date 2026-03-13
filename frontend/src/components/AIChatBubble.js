import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { ScrollArea } from '../components/ui/scroll-area';
import { toast } from 'sonner';
import { 
  MessageCircle, X, Send, Bot, User, Loader2, 
  Minimize2, Maximize2, Trash2, Sparkles 
} from 'lucide-react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function AIChatBubble() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const messagesEndRef = useRef(null);

  // Check if AI assistant is available for this user
  useEffect(() => {
    const checkAvailability = async () => {
      if (!user) {
        console.log('AIChatBubble: No user logged in');
        return;
      }
      
      try {
        console.log('AIChatBubble: Checking availability for user:', user.email);
        const response = await axios.get(`${API_URL}/api/ai/status`);
        console.log('AIChatBubble: Status response:', response.data);
        setIsAvailable(response.data.available);
      } catch (error) {
        console.error('AIChatBubble: Error checking status:', error.response?.data || error.message);
        setIsAvailable(false);
      }
    };
    
    checkAvailability();
  }, [user]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load chat history on open
  useEffect(() => {
    if (isOpen && isAvailable && messages.length === 0) {
      loadChatHistory();
    }
  }, [isOpen, isAvailable]);

  const loadChatHistory = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/ai/chat/history?limit=20`);
      
      const history = response.data.history || [];
      if (history.length > 0) {
        // Convert history to messages format (reversed since API returns newest first)
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
        // Add welcome message
        setMessages([{
          role: 'assistant',
          content: "Hello! I'm your AI assistant. I can help you understand your CRM data - leads, accounts, team performance, and more. What would you like to know?",
          timestamp: new Date().toISOString()
        }]);
      }
    } catch (error) {
      console.error('Failed to load chat history:', error);
    }
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
    
    try {
      const response = await axios.post(
        `${API_URL}/api/ai/chat`,
        { 
          message: inputMessage,
          session_id: sessionId 
        }
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
      
      // Remove the user message if there was an error
      setMessages(prev => prev.slice(0, -1));
      setInputMessage(userMessage.content);
    } finally {
      setIsLoading(false);
    }
  };

  const clearHistory = async () => {
    try {
      await axios.delete(`${API_URL}/api/ai/chat/history`);
      setMessages([{
        role: 'assistant',
        content: "Chat history cleared. How can I help you today?",
        timestamp: new Date().toISOString()
      }]);
      setSessionId(null);
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
      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center group hover:scale-110"
          data-testid="ai-chat-bubble-btn"
        >
          <Sparkles className="w-6 h-6 group-hover:rotate-12 transition-transform" />
          <span className="absolute -top-2 -right-2 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center text-xs font-bold animate-pulse">
            AI
          </span>
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <Card 
          className={`fixed z-50 shadow-2xl transition-all duration-300 ${
            isMinimized 
              ? 'bottom-6 right-6 w-72 h-14' 
              : 'bottom-6 right-6 w-96 h-[500px] md:w-[420px] md:h-[550px]'
          }`}
          data-testid="ai-chat-window"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-t-lg">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5" />
              <span className="font-semibold">AI Assistant</span>
            </div>
            <div className="flex items-center gap-1">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 text-white hover:bg-white/20"
                onClick={clearHistory}
                title="Clear history"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 text-white hover:bg-white/20"
                onClick={() => setIsMinimized(!isMinimized)}
              >
                {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 text-white hover:bg-white/20"
                onClick={() => setIsOpen(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Messages Area */}
          {!isMinimized && (
            <>
              <ScrollArea className="flex-1 p-4 h-[380px] md:h-[430px]">
                <div className="space-y-4">
                  {messages.map((msg, index) => (
                    <div 
                      key={index} 
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`flex gap-2 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                          msg.role === 'user' 
                            ? 'bg-blue-500 text-white' 
                            : 'bg-purple-100 text-purple-600'
                        }`}>
                          {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                        </div>
                        <div className={`rounded-lg p-3 text-sm ${
                          msg.role === 'user' 
                            ? 'bg-blue-500 text-white' 
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                          {msg.context && msg.context.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-500">
                              Data: {msg.context.join(', ')}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="flex gap-2 max-w-[85%]">
                        <div className="w-7 h-7 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center flex-shrink-0">
                          <Bot className="w-4 h-4" />
                        </div>
                        <div className="bg-gray-100 rounded-lg p-3">
                          <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Input Area */}
              <div className="p-3 border-t">
                <div className="flex gap-2">
                  <Input
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Ask about your CRM data..."
                    disabled={isLoading}
                    className="flex-1"
                    data-testid="ai-chat-input"
                  />
                  <Button 
                    onClick={sendMessage} 
                    disabled={isLoading || !inputMessage.trim()}
                    className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                    data-testid="ai-chat-send-btn"
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>
      )}
    </>
  );
}

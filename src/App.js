/* eslint-disable no-undef */
import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, Copy, Check, Shield, Smartphone } from 'lucide-react';

const API_URL = "https://totp-authenticator-production.up.railway.app";

// TOTP generation function
const generateTOTP = (secret, timeStep = 30, digits = 6) => {
  const base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  
  // Base32 decode
  const base32Decode = (encoded) => {
    const cleanedEncoded = encoded.replace(/=+$/, '').toUpperCase();
    let bits = '';
    
    for (let i = 0; i < cleanedEncoded.length; i++) {
      const char = cleanedEncoded[i];
      const index = base32chars.indexOf(char);
      if (index === -1) continue;
      bits += index.toString(2).padStart(5, '0');
    }
    
    const bytes = [];
    for (let i = 0; i < bits.length; i += 8) {
      const byte = bits.substr(i, 8);
      if (byte.length === 8) {
        bytes.push(parseInt(byte, 2));
      }
    }
    
    return new Uint8Array(bytes);
  };
  
  // HMAC-SHA1
  const hmacSha1 = async (key, message) => {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, message);
    return new Uint8Array(signature);
  };
  
  // Get current time step
  const timeCounter = Math.floor(Date.now() / 1000 / timeStep);
  
  // Convert time counter to 8-byte array
  const timeBytes = new ArrayBuffer(8);
  const timeView = new DataView(timeBytes);
  timeView.setBigUint64(0, BigInt(timeCounter), false);
  
  // Generate HMAC
  return hmacSha1(base32Decode(secret), timeBytes).then(hmac => {
    // Dynamic truncation
    const offset = hmac[hmac.length - 1] & 0xf;
    const code = (
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)
    ) % Math.pow(10, digits);
    
    return code.toString().padStart(digits, '0');
  });
};

// Parse otpauth URL
const parseOtpAuthUrl = (url) => {
  try {
    const urlObj = new URL(url);
    if (urlObj.protocol !== 'otpauth:') return null;
    
    const type = urlObj.host;
    const label = decodeURIComponent(urlObj.pathname.substring(1));
    const secret = urlObj.searchParams.get('secret');
    const issuer = urlObj.searchParams.get('issuer');
    const digits = parseInt(urlObj.searchParams.get('digits') || '6');
    const period = parseInt(urlObj.searchParams.get('period') || '30');
    
    if (!secret || type !== 'totp') return null;
    
    return {
      label,
      secret,
      issuer: issuer || '',
      digits,
      period
    };
  } catch {
    return null;
  }
};

const App = () => {
  const [accounts, setAccounts] = useState([]);
  const [codes, setCodes] = useState({});
  const [timeLeft, setTimeLeft] = useState(30);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false); // THÊM: flag để biết đã load data chưa
  const [newAccount, setNewAccount] = useState({
    label: '',
    secret: '',
    issuer: '',
    digits: 6,
    period: 30
  });

  // Load accounts from database
  useEffect(() => {
    const loadAccounts = async () => {
      try {
        const response = await fetch(`${API_URL}/api/accounts`);
        const data = await response.json();
        setAccounts(data);
        setIsLoaded(true); // THÊM: đánh dấu đã load xong
      } catch (error) {
        console.error('Error loading accounts:', error);
        setIsLoaded(true); // Vẫn đánh dấu đã load để tránh lặp
      }
    };
    
    loadAccounts();
  }, []);

  // Save accounts to database - CHỈ SAU KHI ĐÃ LOAD XONG
  useEffect(() => {
    const saveAccounts = async () => {
      // CHỈ save khi đã load xong và có thay đổi thực sự
      if (!isLoaded) return;
      
      try {
        await fetch(`${API_URL}/api/accounts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(accounts),
        });
        console.log('✅ Saved accounts:', accounts.length);
      } catch (error) {
        console.error('Error saving accounts:', error);
      }
    };
    
    saveAccounts();
  }, [accounts, isLoaded]); // Thêm isLoaded vào dependency

  // Generate codes for all accounts
  const generateCodes = useCallback(async () => {
    const newCodes = {};
    for (const account of accounts) {
      try {
        const code = await generateTOTP(account.secret, account.period, account.digits);
        newCodes[account.id] = code;
      } catch (e) {
        console.error('Error generating code for', account.label, e);
        newCodes[account.id] = '------';
      }
    }
    setCodes(newCodes);
  }, [accounts]);

  // Timer effect
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      const period = 30000; // 30 seconds in milliseconds
      const remaining = period - (now % period);
      setTimeLeft(Math.ceil(remaining / 1000));
      
      if (remaining <= 1000) {
        generateCodes();
      }
    }, 1000);

    generateCodes();
    return () => clearInterval(timer);
  }, [generateCodes]);

  const addAccount = () => {
    if (!newAccount.label || !newAccount.secret) return;
    
    const account = {
      id: Date.now().toString(),
      ...newAccount,
      secret: newAccount.secret.replace(/\s/g, '').toUpperCase()
    };
    
    setAccounts(prev => [...prev, account]);
    setNewAccount({ label: '', secret: '', issuer: '', digits: 6, period: 30 });
    setShowAddForm(false);
  };

  const editAccount = (account) => {
    setEditingAccount(account.id);
    setNewAccount(account);
    setShowAddForm(true);
  };

  const updateAccount = () => {
    if (!newAccount.label || !newAccount.secret) return;
    
    setAccounts(prev => prev.map(acc => 
      acc.id === editingAccount 
        ? { ...acc, ...newAccount, secret: newAccount.secret.replace(/\s/g, '').toUpperCase() }
        : acc
    ));
    
    setEditingAccount(null);
    setNewAccount({ label: '', secret: '', issuer: '', digits: 6, period: 30 });
    setShowAddForm(false);
  };

  const deleteAccount = (id) => {
    setAccounts(prev => prev.filter(acc => acc.id !== id));
  };

  const copyCode = async (code, id) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (e) {
      console.error('Failed to copy:', e);
    }
  };

  const handleQRInput = (value) => {
    const parsed = parseOtpAuthUrl(value);
    if (parsed) {
      setNewAccount(parsed);
    } else {
      setNewAccount(prev => ({ ...prev, secret: value }));
    }
  };

  const progress = ((30 - timeLeft) / 30) * 100;

  // Hiển thị loading khi chưa load xong
  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-full mb-4">
            <Shield className="w-8 h-8 text-white animate-pulse" />
          </div>
          <p className="text-gray-600">Loading accounts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-md mx-auto pt-8 pb-20 px-4">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-full mb-4">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">TOTP Authenticator</h1>
          <p className="text-gray-600">Secure two-factor authentication</p>
        </div>

        {/* Timer */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-700">Next refresh in</span>
            <span className="text-2xl font-bold text-blue-600">{timeLeft}s</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-1000 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Accounts List */}
        <div className="space-y-4 mb-6">
          {accounts.map(account => (
            <div key={account.id} className="bg-white rounded-2xl shadow-lg p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 text-lg">{account.label}</h3>
                  {account.issuer && (
                    <p className="text-sm text-gray-600 mt-1">{account.issuer}</p>
                  )}
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => editAccount(account)}
                    className="p-2 text-gray-400 hover:text-blue-600 transition-colors rounded-full hover:bg-blue-50"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteAccount(account.id)}
                    className="p-2 text-gray-400 hover:text-red-600 transition-colors rounded-full hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="text-3xl font-mono font-bold text-gray-900 tracking-wider">
                  {codes[account.id] || '------'}
                </div>
                <button
                  onClick={() => copyCode(codes[account.id], account.id)}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  {copiedId === account.id ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span className="text-sm">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span className="text-sm">Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Empty State */}
        {accounts.length === 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
            <Smartphone className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No accounts yet</h3>
            <p className="text-gray-600 mb-6">Add your first account to start generating codes</p>
            <button
              onClick={() => setShowAddForm(true)}
              className="inline-flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-5 h-5" />
              <span>Add Account</span>
            </button>
          </div>
        )}

        {/* Add Account Form */}
        {showAddForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                {editingAccount ? 'Edit Account' : 'Add New Account'}
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Account Name *
                  </label>
                  <input
                    type="text"
                    value={newAccount.label}
                    onChange={(e) => setNewAccount(prev => ({ ...prev, label: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    placeholder="e.g., john@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Secret Key / QR Code URL *
                  </label>
                  <textarea
                    value={newAccount.secret}
                    onChange={(e) => handleQRInput(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    rows="3"
                    placeholder="Enter secret key or paste otpauth:// URL"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Paste QR code URL or enter the secret key manually
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Issuer (Optional)
                  </label>
                  <input
                    type="text"
                    value={newAccount.issuer}
                    onChange={(e) => setNewAccount(prev => ({ ...prev, issuer: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    placeholder="e.g., Google, Microsoft"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Digits
                    </label>
                    <select
                      value={newAccount.digits}
                      onChange={(e) => setNewAccount(prev => ({ ...prev, digits: parseInt(e.target.value) }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    >
                      <option value={6}>6 digits</option>
                      <option value={8}>8 digits</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Period (seconds)
                    </label>
                    <select
                      value={newAccount.period}
                      onChange={(e) => setNewAccount(prev => ({ ...prev, period: parseInt(e.target.value) }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    >
                      <option value={30}>30 seconds</option>
                      <option value={60}>60 seconds</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex space-x-4 mt-8">
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setEditingAccount(null);
                    setNewAccount({ label: '', secret: '', issuer: '', digits: 6, period: 30 });
                  }}
                  className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={editingAccount ? updateAccount : addAccount}
                  disabled={!newAccount.label || !newAccount.secret}
                  className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {editingAccount ? 'Update' : 'Add'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Button */}
        {accounts.length > 0 && (
          <button
            onClick={() => setShowAddForm(true)}
            className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-colors flex items-center justify-center"
          >
            <Plus className="w-6 h-6" />
          </button>
        )}
      </div>
    </div>
  );
};

export default App;
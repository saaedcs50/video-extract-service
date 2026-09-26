import React, { useState } from 'react';
import {
  Server,
  ShieldCheck,
  Download,
  FileCode2,
  Terminal,
  Copy,
  Check,
  AlertTriangle,
  ExternalLink,
  Layers,
  Key,
  Clock,
  Play,
  CheckCircle2,
  Cpu
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'overview' | 'tester' | 'endpoints' | 'deploy' | 'files'>('overview');
  const [secretKey, setSecretKey] = useState('youngtube_prod_secret_token_2026');
  const [testVideoId, setTestVideoId] = useState('dQw4w9WgXcQ');
  const [testItag, setTestItag] = useState('18');
  const [testExpMins, setTestExpMins] = useState('60');
  const [generatedToken, setGeneratedToken] = useState('');
  const [tokenPayloadDisplay, setTokenPayloadDisplay] = useState('');
  const [copiedToken, setCopiedToken] = useState(false);
  const [verifyInput, setVerifyInput] = useState('');
  const [verifyResult, setVerifyResult] = useState<{ valid: boolean; message: string; data?: any } | null>(null);

  // Base64URL helper
  function base64UrlEncode(str: string): string {
    return btoa(str)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  // Generate Token using Web Crypto HMAC-SHA256
  const handleGenerateToken = async () => {
    try {
      const now = Math.floor(Date.now() / 1000);
      const exp = now + parseInt(testExpMins, 10) * 60;
      const payloadObj = {
        videoId: testVideoId.trim(),
        itag: parseInt(testItag, 10),
        exp,
      };

      const payloadJson = JSON.stringify(payloadObj);
      const payloadB64 = base64UrlEncode(payloadJson);

      const encoder = new TextEncoder();
      const keyData = encoder.encode(secretKey);
      const cryptoKey = await window.crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );

      const signatureBytes = await window.crypto.subtle.sign(
        'HMAC',
        cryptoKey,
        encoder.encode(payloadB64)
      );

      const signatureArray = Array.from(new Uint8Array(signatureBytes));
      const signatureBinary = String.fromCharCode(...signatureArray);
      const signatureB64 = base64UrlEncode(signatureBinary);

      const token = `${payloadB64}.${signatureB64}`;
      setGeneratedToken(token);
      setTokenPayloadDisplay(JSON.stringify(payloadObj, null, 2));
      setVerifyInput(token);
      setVerifyResult(null);
    } catch (err: any) {
      console.error(err);
    }
  };

  // Test Verifying token in client
  const handleVerifyClientToken = async () => {
    try {
      if (!verifyInput.trim()) return;
      const parts = verifyInput.trim().split('.');
      if (parts.length !== 2) {
        setVerifyResult({ valid: false, message: 'Invalid token structure (expected payload.signature)' });
        return;
      }
      const [pB64, sB64] = parts;

      const encoder = new TextEncoder();
      const keyData = encoder.encode(secretKey);
      const cryptoKey = await window.crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );

      const expectedSig = await window.crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(pB64));
      const expectedBinary = String.fromCharCode(...Array.from(new Uint8Array(expectedSig)));
      const expectedB64 = base64UrlEncode(expectedBinary);

      if (expectedB64 !== sB64) {
        setVerifyResult({ valid: false, message: 'Invalid HMAC signature! Secret mismatch or altered payload.' });
        return;
      }

      // Decode payload
      let normalized = pB64.replace(/-/g, '+').replace(/_/g, '/');
      while (normalized.length % 4) normalized += '=';
      const rawJson = atob(normalized);
      const payload = JSON.parse(rawJson);

      const now = Math.floor(Date.now() / 1000);
      if (payload.exp < now) {
        setVerifyResult({ valid: false, message: `Token has expired! (exp: ${payload.exp}, current: ${now})`, data: payload });
        return;
      }

      setVerifyResult({
        valid: true,
        message: 'Signature verified and timestamp is active!',
        data: payload
      });
    } catch (e: any) {
      setVerifyResult({ valid: false, message: `Error: ${e.message}` });
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navigation */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-red-600 flex items-center justify-center shadow-lg shadow-red-950/40">
              <Server className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-white">video-extract-service</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                  SnapDeploy Ready
                </span>
              </div>
              <p className="text-xs text-slate-400">Standalone Node.js / Express Container Service</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="#deploy"
              onClick={() => setActiveTab('deploy')}
              className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium transition flex items-center gap-1.5"
            >
              <Cpu className="w-3.5 h-3.5 text-amber-400" />
              <span>Deploy to SnapDeploy</span>
            </a>
          </div>
        </div>
      </header>

      {/* Main Tabs */}
      <div className="border-b border-slate-800 bg-slate-900/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex gap-1 overflow-x-auto py-2">
          {[
            { id: 'overview', label: 'Architecture & Overview', icon: Layers },
            { id: 'endpoints', label: 'API Specifications', icon: Terminal },
            { id: 'tester', label: 'Token Generator & Tester', icon: Key },
            { id: 'files', label: 'Project Files', icon: FileCode2 },
            { id: 'deploy', label: 'SnapDeploy Guide', icon: Cpu },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${
                  isActive
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Notice Banner */}
        <div className="mb-6 p-4 rounded-xl bg-amber-950/30 border border-amber-800/40 flex items-start gap-3.5 text-sm text-amber-200">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-300">YouTube Terms of Service & Stream Extraction Notice</p>
            <p className="text-xs text-amber-300/80 mt-1 leading-relaxed">
              This service uses reverse-engineered YouTube stream extraction techniques (powered by{' '}
              <code className="bg-amber-950/80 px-1 py-0.5 rounded text-amber-200 font-mono">@distube/ytdl-core</code>)
              rather than an official YouTube API, and operating it carries YouTube Terms of Service risk, including
              potential IP rate-limiting, temporary blocks, or service disruption when YouTube updates web player formats.
            </p>
          </div>
        </div>

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center mb-3">
                  <Server className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-white">Fully Stateless Service</h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  No database, no user accounts, no session storage. Operates on pure HMAC signature verification and
                  real-time YouTube stream negotiation.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-3">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-white">HMAC-SHA256 Token Auth</h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  Downloads are guarded by signed, time-limited tokens (<code className="text-emerald-300">payload.signature</code>)
                  issued by your separate Cloudflare Worker with identical secret keys.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center mb-3">
                  <Download className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-white">Resumable Byte Streaming</h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  Supports HTTP Range requests (<code className="text-amber-300">206 Partial Content</code>) piped directly to
                  the client without buffering the video in memory.
                </p>
              </div>
            </div>

            {/* Architecture Flow */}
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Layers className="w-5 h-5 text-amber-400" />
                <span>Service Architecture & Request Flow</span>
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-mono">
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                  <div className="text-slate-400 font-sans font-medium text-sm flex items-center justify-between">
                    <span>1. Client Request</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">Frontend</span>
                  </div>
                  <p className="text-slate-400 font-sans">
                    Client requests format metadata via:
                  </p>
                  <p className="text-amber-400 break-all">GET /extract?videoId=...</p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                  <div className="text-slate-400 font-sans font-medium text-sm flex items-center justify-between">
                    <span>2. Format Selection</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-blue-900/50 text-blue-300">ytdl-core</span>
                  </div>
                  <p className="text-slate-400 font-sans">
                    Filters combined audio+video formats, selecting lowest resolution &gt;= 360p.
                  </p>
                  <p className="text-blue-400">itag: 18 (360p), container: mp4</p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                  <div className="text-slate-400 font-sans font-medium text-sm flex items-center justify-between">
                    <span>3. Token Issuance</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-purple-900/50 text-purple-300">Worker</span>
                  </div>
                  <p className="text-slate-400 font-sans">
                    Cloudflare Worker creates signed token with HMAC-SHA256 and expiry.
                  </p>
                  <p className="text-purple-400">base64url(payload) + '.' + base64url(sig)</p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                  <div className="text-slate-400 font-sans font-medium text-sm flex items-center justify-between">
                    <span>4. Stream Download</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-900/50 text-emerald-300">Express</span>
                  </div>
                  <p className="text-slate-400 font-sans">
                    Verifies token, requests fresh CDN stream from YouTube, pipes Range bytes.
                  </p>
                  <p className="text-emerald-400">GET /download?token=...</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ENDPOINTS SPEC */}
        {activeTab === 'endpoints' && (
          <div className="space-y-6">
            {/* Health Endpoint */}
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex items-center gap-3">
                <span className="px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  GET
                </span>
                <span className="text-base font-mono text-white font-semibold">/health</span>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400">Health Check</span>
              </div>
              <p className="text-sm text-slate-300">
                Used by container orchestrators, load balancers, and SnapDeploy probes to verify container readiness.
              </p>
              <div className="bg-slate-950 rounded-xl p-4 font-mono text-xs text-slate-300 border border-slate-800">
                <div className="text-slate-500 mb-1">// Response (Status 200 OK):</div>
                <pre className="text-emerald-400">{JSON.stringify({ status: 'ok' }, null, 2)}</pre>
              </div>
            </div>

            {/* Extract Endpoint */}
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex items-center gap-3">
                <span className="px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  GET
                </span>
                <span className="text-base font-mono text-white font-semibold">/extract?videoId={'{videoId}'}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Format Extractor
                </span>
              </div>
              <p className="text-sm text-slate-300">
                Validates the 11-character video ID, fetches format info from YouTube via ytdl-core, and returns the lowest-resolution combined audio+video format that is at least 360p.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-950 rounded-xl p-4 font-mono text-xs text-slate-300 border border-slate-800">
                  <div className="text-slate-500 mb-1">// Success (Status 200 OK):</div>
                  <pre className="text-emerald-400">
{JSON.stringify(
  {
    videoId: 'dQw4w9WgXcQ',
    title: 'Rick Astley - Never Gonna Give You Up (Official Music Video)',
    durationSeconds: 213,
    itag: 18,
    contentLength: '15438291',
    container: 'mp4'
  },
  null,
  2
)}
                  </pre>
                </div>

                <div className="bg-slate-950 rounded-xl p-4 font-mono text-xs text-slate-300 border border-slate-800">
                  <div className="text-slate-500 mb-1">// Error Responses:</div>
                  <div className="space-y-2">
                    <div>
                      <span className="text-red-400 font-bold">400 Bad Request:</span>
                      <pre className="text-red-300 mt-1">{JSON.stringify({ error: 'معرف الفيديو غير صالح' })}</pre>
                    </div>
                    <div>
                      <span className="text-red-400 font-bold">404 Not Found:</span>
                      <pre className="text-red-300 mt-1">{JSON.stringify({ error: 'لا توجد صيغة متاحة لهذا الفيديو' })}</pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Download Endpoint */}
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex items-center gap-3">
                <span className="px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  GET
                </span>
                <span className="text-base font-mono text-white font-semibold">/download?token={'{token}'}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Resumable Stream
                </span>
              </div>
              <p className="text-sm text-slate-300">
                Verifies HMAC signature and expiration timestamp. Re-fetches fresh format info via ytdl-core (never trusts cached URLs). Piped directly to response without in-memory buffering.
              </p>

              <div className="bg-slate-950 rounded-xl p-4 font-mono text-xs text-slate-300 border border-slate-800 space-y-2">
                <div className="text-slate-500">// Response Headers:</div>
                <div className="text-slate-400 space-y-1">
                  <div>HTTP/1.1 200 OK (or 206 Partial Content if Range header supplied)</div>
                  <div>Content-Type: video/mp4</div>
                  <div>Content-Disposition: attachment; filename="Rick Astley.mp4"; filename*=UTF-8''Rick%20Astley.mp4</div>
                  <div>Accept-Ranges: bytes</div>
                  <div>Content-Range: bytes 0-1048575/15438291 (on 206 response)</div>
                  <div>Access-Control-Allow-Origin: *</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: TOKEN TESTER */}
        {activeTab === 'tester' && (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800">
              <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                <Key className="w-5 h-5 text-amber-400" />
                <span>HMAC-SHA256 Token Generator & Validator</span>
              </h2>
              <p className="text-xs text-slate-400 mb-6">
                Test the token generation logic used by your Cloudflare Worker and verify that the Node.js service accepts it.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Inputs */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      DOWNLOAD_TOKEN_SECRET
                    </label>
                    <input
                      type="text"
                      value={secretKey}
                      onChange={(e) => setSecretKey(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-1">
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Video ID (11 chars)
                      </label>
                      <input
                        type="text"
                        value={testVideoId}
                        onChange={(e) => setTestVideoId(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        itag (Format)
                      </label>
                      <input
                        type="number"
                        value={testItag}
                        onChange={(e) => setTestItag(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Expires In (mins)
                      </label>
                      <input
                        type="number"
                        value={testExpMins}
                        onChange={(e) => setTestExpMins(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleGenerateToken}
                    className="w-full py-2.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-semibold text-sm transition flex items-center justify-center gap-2"
                  >
                    <Play className="w-4 h-4 fill-slate-950" />
                    <span>Generate HMAC Token</span>
                  </button>
                </div>

                {/* Output */}
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-slate-300">
                        Generated Signed Token
                      </label>
                      {generatedToken && (
                        <button
                          onClick={() => handleCopy(generatedToken)}
                          className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1"
                        >
                          {copiedToken ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedToken ? 'Copied' : 'Copy'}</span>
                        </button>
                      )}
                    </div>
                    <textarea
                      readOnly
                      rows={3}
                      value={generatedToken}
                      placeholder="Click 'Generate HMAC Token' to produce a valid token..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-amber-300 font-mono focus:outline-none resize-none"
                    />
                  </div>

                  {tokenPayloadDisplay && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Decoded JSON Payload
                      </label>
                      <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-400 font-mono overflow-x-auto">
                        {tokenPayloadDisplay}
                      </pre>
                    </div>
                  )}
                </div>
              </div>

              {/* Verifier Section */}
              <div className="mt-8 pt-6 border-t border-slate-800">
                <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Verify / Inspect Token</span>
                </h3>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={verifyInput}
                    onChange={(e) => setVerifyInput(e.target.value)}
                    placeholder="Paste token string here..."
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                  <button
                    onClick={handleVerifyClientToken}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition"
                  >
                    Verify Token
                  </button>
                </div>

                {verifyResult && (
                  <div
                    className={`mt-4 p-4 rounded-xl border text-xs font-mono ${
                      verifyResult.valid
                        ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300'
                        : 'bg-red-950/20 border-red-800/40 text-red-300'
                    }`}
                  >
                    <div className="font-bold flex items-center gap-2">
                      {verifyResult.valid ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-red-400" />}
                      <span>{verifyResult.message}</span>
                    </div>
                    {verifyResult.data && (
                      <pre className="mt-2 text-slate-300 bg-slate-950/80 p-2.5 rounded-lg border border-slate-800">
                        {JSON.stringify(verifyResult.data, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: PROJECT FILES */}
        {activeTab === 'files' && (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800">
              <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                <FileCode2 className="w-5 h-5 text-amber-400" />
                <span>Project Structure: video-extract-service</span>
              </h2>
              <p className="text-xs text-slate-400 mb-6">
                All files for the standalone service are completely created and located in the <code className="text-amber-300">video-extract-service/</code> folder.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="text-amber-400 font-bold">video-extract-service/index.js</div>
                  <p className="text-slate-400 font-sans text-xs">
                    Main Express application entry point. Binds to <code className="text-slate-300">0.0.0.0</code> and <code className="text-slate-300">process.env.PORT || 3000</code>. Defines <code className="text-slate-300">/health</code>, <code className="text-slate-300">/extract</code>, and <code className="text-slate-300">/download</code> with HTTP Range streaming support.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="text-amber-400 font-bold">video-extract-service/src/verifyToken.js</div>
                  <p className="text-slate-400 font-sans text-xs">
                    HMAC-SHA256 signature verifier and token expiration validator. Fails loudly at startup with an explicit console error if <code className="text-slate-300">DOWNLOAD_TOKEN_SECRET</code> is missing.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="text-amber-400 font-bold">video-extract-service/Dockerfile</div>
                  <p className="text-slate-400 font-sans text-xs">
                    Multi-architecture container definition based on <code className="text-slate-300">node:20-alpine</code>. Runs <code className="text-slate-300">npm install --production</code>, exposes port 3000, and executes <code className="text-slate-300">node index.js</code>.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="text-amber-400 font-bold">video-extract-service/package.json</div>
                  <p className="text-slate-400 font-sans text-xs">
                    Clean dependencies: <code className="text-slate-300">express</code>, <code className="text-slate-300">@distube/ytdl-core</code>, and <code className="text-slate-300">cors</code>. Zero Cloudflare-specific dependencies.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="text-amber-400 font-bold">video-extract-service/.dockerignore &amp; .gitignore</div>
                  <p className="text-slate-400 font-sans text-xs">
                    Prevents <code className="text-slate-300">node_modules</code> and sensitive <code className="text-slate-300">.env</code> files from leaking into docker builds or git commits.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="text-amber-400 font-bold">video-extract-service/README.md</div>
                  <p className="text-slate-400 font-sans text-xs">
                    Complete documentation including ToS warning, setup instructions, token specs, and SnapDeploy instructions.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: SNAPDEPLOY GUIDE */}
        {activeTab === 'deploy' && (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-5">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Cpu className="w-5 h-5 text-amber-400" />
                <span>SnapDeploy Zero-Configuration Deployment Guide</span>
              </h2>

              <p className="text-sm text-slate-300 leading-relaxed">
                The service is designed to be deployed to SnapDeploy (or any standard Docker container hosting platform) with zero build configuration:
              </p>

              <ol className="space-y-4 text-xs text-slate-300">
                <li className="flex gap-3 items-start">
                  <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center shrink-0">1</span>
                  <div>
                    <strong className="text-white text-sm">Push to GitHub:</strong>
                    <p className="text-slate-400 mt-1">
                      Commit the project files to your GitHub repository.
                    </p>
                  </div>
                </li>

                <li className="flex gap-3 items-start">
                  <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center shrink-0">2</span>
                  <div>
                    <strong className="text-white text-sm">Connect GitHub in SnapDeploy:</strong>
                    <p className="text-slate-400 mt-1">
                      Select your repository. SnapDeploy will automatically detect the <code className="text-amber-300">Dockerfile</code>.
                    </p>
                  </div>
                </li>

                <li className="flex gap-3 items-start">
                  <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center shrink-0">3</span>
                  <div>
                    <strong className="text-white text-sm">Configure Environment Variable:</strong>
                    <p className="text-slate-400 mt-1">
                      In the SnapDeploy dashboard, navigate to the Environment Variables section and add:
                    </p>
                    <div className="mt-2 p-3 bg-slate-950 rounded-lg border border-slate-800 font-mono text-amber-300">
                      DOWNLOAD_TOKEN_SECRET = &lt;identical secret as configured on your Cloudflare Worker&gt;
                    </div>
                  </div>
                </li>

                <li className="flex gap-3 items-start">
                  <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center shrink-0">4</span>
                  <div>
                    <strong className="text-white text-sm">Deploy Container:</strong>
                    <p className="text-slate-400 mt-1">
                      Click deploy. SnapDeploy automatically injects its dynamic <code className="text-slate-300">PORT</code> environment variable, which the server reads seamlessly from <code className="text-slate-300">process.env.PORT || 3000</code> while binding to <code className="text-slate-300">0.0.0.0</code>.
                    </p>
                  </div>
                </li>
              </ol>

              <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-800/40 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Ready to deploy as-is with zero additional configuration beyond the DOWNLOAD_TOKEN_SECRET environment variable.</span>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-900/60 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>video-extract-service &bull; Independent Node.js &amp; Express Container Microservice</span>
          <span>Docker node:20-alpine &bull; Stateless HMAC-SHA256 Token Auth</span>
        </div>
      </footer>
    </div>
  );
}

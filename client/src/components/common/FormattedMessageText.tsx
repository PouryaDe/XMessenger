import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Check, ExternalLink, Terminal } from 'lucide-react';

interface Props {
  text: string;
}

// Regex to capture fenced code blocks, proxy configs, web links, or inline code
const PARSE_REGEX = /(```(?:[a-zA-Z0-9_-]+)?\n?[\s\S]*?```)|((?:vless|vmess|trojan|ss|ssr|tuic|hysteria2|hysteria|hy2|wireguard|warp|clash|snell|shadowsocks|https?):\/\/[^\s\n\r]+)|(`[^`\n\r]+`)/gi;

function cleanTrailingPunctuation(raw: string): { code: string; trailing: string } {
  let code = raw;
  let trailing = '';
  while (code.length > 0 && ['.', ',', ';', '!', '?', ')', ']', '>', '،', '؛'].includes(code[code.length - 1])) {
    trailing = code[code.length - 1] + trailing;
    code = code.slice(0, -1);
  }
  return { code, trailing };
}

function getSchemeBadge(raw: string): { badge: string; isUrl: boolean } {
  const lower = raw.toLowerCase();
  if (lower.startsWith('vless://')) return { badge: 'VLESS', isUrl: false };
  if (lower.startsWith('vmess://')) return { badge: 'VMESS', isUrl: false };
  if (lower.startsWith('trojan://')) return { badge: 'TROJAN', isUrl: false };
  if (lower.startsWith('ss://') || lower.startsWith('shadowsocks://')) return { badge: 'SHADOWSOCKS', isUrl: false };
  if (lower.startsWith('ssr://')) return { badge: 'SSR', isUrl: false };
  if (lower.startsWith('tuic://')) return { badge: 'TUIC', isUrl: false };
  if (lower.startsWith('hysteria://') || lower.startsWith('hysteria2://') || lower.startsWith('hy2://')) return { badge: 'HYSTERIA', isUrl: false };
  if (lower.startsWith('wireguard://') || lower.startsWith('warp://')) return { badge: 'WIREGUARD', isUrl: false };
  if (lower.startsWith('clash://')) return { badge: 'CLASH', isUrl: false };
  if (lower.startsWith('snell://')) return { badge: 'SNELL', isUrl: false };
  if (lower.startsWith('https://') || lower.startsWith('http://')) {
    try {
      const u = new URL(raw);
      const host = u.hostname.replace(/^www\./i, '');
      return { badge: host.toUpperCase(), isUrl: true };
    } catch {
      return { badge: 'LINK', isUrl: true };
    }
  }
  return { badge: 'CODE', isUrl: false };
}

interface CodeCardProps {
  code: string;
  badge: string;
  isUrl: boolean;
}

const CodeCard: React.FC<CodeCardProps> = ({ code, badge, isUrl }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = code;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('Copy failed:', err);
    }
  };

  return (
    <div
      onClick={handleCopy}
      className={`my-2 rounded-2xl border transition-all cursor-pointer overflow-hidden select-text group ${
        copied
          ? 'border-emerald-500/60 dark:border-emerald-400/60 ring-2 ring-emerald-500/20 bg-emerald-500/[0.04]'
          : 'border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-[#0c1017]/90 hover:border-amber-500/40 dark:hover:border-amber-400/40 hover:shadow-xs'
      }`}
    >
      {/* Top Header with Badge & Copy Button */}
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-black/[0.03] dark:bg-white/[0.04] border-b border-black/[0.06] dark:border-white/[0.06]">
        {/* Badge & Protocol Icon */}
        <div className="flex items-center gap-1.5 font-bold tracking-wider text-[10px] text-amber-600 dark:text-amber-400">
          {isUrl ? <ExternalLink className="w-3.5 h-3.5 shrink-0" /> : <Terminal className="w-3.5 h-3.5 shrink-0" />}
          <span className="truncate max-w-[160px] sm:max-w-[220px]">{badge}</span>
        </div>

        {/* Action Buttons: Open Link + Copy */}
        <div className="flex items-center gap-1.5">
          {isUrl && (
            <a
              href={code}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              title={t('openLink')}
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all ${
              copied
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                : 'bg-black/5 dark:bg-white/[0.08] text-slate-700 dark:text-slate-200 hover:bg-black/10 dark:hover:bg-white/[0.14]'
            }`}
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>{t('copiedText')}</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>{t('copyBtn')}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Code Text Content Box */}
      <div 
        dir="ltr" 
        className="p-3 text-[11.5px] leading-relaxed break-all select-all font-sans text-slate-800 dark:text-slate-200 max-h-52 overflow-y-auto"
      >
        {code}
      </div>

      {/* Tap-to-copy Footer Hint */}
      <div className="text-[10px] text-center py-1 bg-black/[0.015] dark:bg-white/[0.02] text-slate-400 dark:text-slate-500 border-t border-black/[0.04] dark:border-white/[0.04] select-none flex items-center justify-center gap-1 font-medium">
        {copied ? (
          <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
            <Check className="w-3 h-3 stroke-[2.5]" />
            <span>{t('copiedText')}</span>
          </span>
        ) : (
          <span>{t('tapToCopy')}</span>
        )}
      </div>
    </div>
  );
};

export const FormattedMessageText: React.FC<Props> = ({ text }) => {
  // If no match found, render standard paragraph
  if (!PARSE_REGEX.test(text)) {
    PARSE_REGEX.lastIndex = 0;
    return (
      <p dir="auto" className="whitespace-pre-wrap select-text font-normal text-start">
        {text}
      </p>
    );
  }

  PARSE_REGEX.lastIndex = 0;

  const elements: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = PARSE_REGEX.exec(text)) !== null) {
    const matchIdx = match.index;

    // Plain text before match
    if (matchIdx > lastIdx) {
      const plainSegment = text.slice(lastIdx, matchIdx);
      elements.push(
        <span key={`text-${lastIdx}`} dir="auto" className="whitespace-pre-wrap select-text">
          {plainSegment}
        </span>
      );
    }

    const matchedStr = match[0];

    // Case 1: Markdown Fenced Code Block ```lang\n...```
    if (matchedStr.startsWith('```') && matchedStr.endsWith('```')) {
      const inner = matchedStr.slice(3, -3);
      const firstNewline = inner.indexOf('\n');
      let lang = 'CODE';
      let codeBody = inner;
      if (firstNewline !== -1) {
        const potentialLang = inner.slice(0, firstNewline).trim();
        if (potentialLang && !potentialLang.includes(' ')) {
          lang = potentialLang.toUpperCase();
          codeBody = inner.slice(firstNewline + 1);
        }
      }
      elements.push(
        <CodeCard
          key={`codeblock-${matchIdx}`}
          code={codeBody.trim()}
          badge={lang}
          isUrl={false}
        />
      );
    }
    // Case 2: Inline code `...`
    else if (matchedStr.startsWith('`') && matchedStr.endsWith('`')) {
      const code = matchedStr.slice(1, -1);
      const isProxyOrUrl = /^(?:vless|vmess|trojan|ss|ssr|tuic|hysteria2|hysteria|hy2|wireguard|warp|clash|snell|shadowsocks|https?):\/\//i.test(code);
      if (isProxyOrUrl) {
        const { badge, isUrl } = getSchemeBadge(code);
        elements.push(
          <CodeCard
            key={`inline-card-${matchIdx}`}
            code={code}
            badge={badge}
            isUrl={isUrl}
          />
        );
      } else {
        elements.push(
          <code
            key={`inline-${matchIdx}`}
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard?.writeText(code);
            }}
            className="px-1.5 py-0.5 mx-0.5 rounded-md bg-black/[0.06] dark:bg-white/[0.08] text-amber-600 dark:text-amber-400 text-xs cursor-pointer hover:bg-black/10 transition-colors"
            title="کپی"
          >
            {code}
          </code>
        );
      }
    }
    // Case 3: Proxy Config (vless, vmess, etc.) or Web Link
    else {
      const { code, trailing } = cleanTrailingPunctuation(matchedStr);
      const { badge, isUrl } = getSchemeBadge(code);

      elements.push(
        <CodeCard
          key={`config-${matchIdx}`}
          code={code}
          badge={badge}
          isUrl={isUrl}
        />
      );

      if (trailing) {
        elements.push(
          <span key={`trailing-${matchIdx}`} dir="auto" className="whitespace-pre-wrap select-text">
            {trailing}
          </span>
        );
      }
    }

    lastIdx = PARSE_REGEX.lastIndex;
  }

  // Trailing text after last match
  if (lastIdx < text.length) {
    elements.push(
      <span key={`text-end`} dir="auto" className="whitespace-pre-wrap select-text">
        {text.slice(lastIdx)}
      </span>
    );
  }

  return (
    <div dir="auto" className="select-text font-normal text-start leading-relaxed">
      {elements}
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';  
import { Link } from 'react-router-dom';  
  
// ── Sidebar structure ─────────────────────────────────────────────────────────  
const TABS = [  
  {  
    id: 'overview',  
    label: 'Overview',  
    sections: [  
      { id: 'what-is-zeroremit', label: 'What is Zeroremit' },  
      { id: 'how-it-works',      label: 'How it works'       },  
      { id: 'key-concepts',      label: 'Key concepts'       },  
      { id: 'network',           label: 'Network & tokens'   },  
      { id: 'privacy-model',     label: 'Privacy model'      },  
    ],  
  },  
  {  
    id: 'contracts',  
    label: 'Contracts',  
    sections: [  
      { id: 'payment-router',    label: 'PaymentRouter'      },  
      { id: 'donation-vault',    label: 'DonationVault'      },  
      { id: 'cusdc',             label: 'ConfidentialUSDC'   },  
      { id: 'invoice-types',     label: 'Invoice types'      },  
      { id: 'invoice-lifecycle', label: 'Invoice lifecycle'  },  
      { id: 'events',            label: 'Events'             },  
    ],  
  },  
  {  
    id: 'backend',  
    label: 'Backend',  
    sections: [  
      { id: 'backend-overview',    label: 'Overview'            },  
      { id: 'backend-architecture',label: 'Architecture'        },  
      { id: 'backend-database',    label: 'Database (PostgreSQL)'},  
      { id: 'backend-rpc-fallback',label: 'RPC fallback system' },  
      { id: 'backend-indexer',     label: 'Chain indexer'       },  
      { id: 'backend-bot',         label: 'Telegram bot'        },  
      { id: 'backend-webhooks',    label: 'Webhook delivery'    },  
      { id: 'backend-automation',  label: 'Automation layer'    },  
      { id: 'backend-deployment',  label: 'Deployment (Render)' },  
      { id: 'backend-env',         label: 'Environment variables'},  
    ],  
  },  
  {  
    id: 'zama',  
    label: 'Zama SDK',  
    sections: [  
      { id: 'fhe-overview',      label: 'FHE overview'       },  
      { id: 'encryption-flow',   label: 'Encryption flow'    },  
      { id: 'decryption-flow',   label: 'Decryption flow'    },  
      { id: 'server-side-fhe',   label: 'Server-side FHE'    },  
      { id: 'fhe-limits',        label: 'Limits & caveats'   },  
    ],  
  },  
  {  
    id: 'integrations',  
    label: 'Integrations',  
    sections: [  
      { id: 'telegram-bot',      label: 'Telegram bot'       },  
      { id: 'zapier',            label: 'Zapier'             },  
      { id: 'webhooks',          label: 'Webhooks'           },  
      { id: 'burner-wallets',    label: 'Burner wallets'     },  
      { id: 'api-keys',          label: 'API keys'           },  
    ],  
  },  
  {  
    id: 'api',  
    label: 'API Reference',  
    sections: [  
      { id: 'authentication',    label: 'Authentication'     },  
      { id: 'public-invoices',   label: 'POST /public/invoices' },  
      { id: 'burner-endpoints',  label: 'Burner endpoints'   },  
      { id: 'key-endpoints',     label: 'API key endpoints'  },  
      { id: 'webhook-endpoints', label: 'Webhook endpoints'  },  
      { id: 'telegram-endpoints',label: 'Telegram endpoints' },  
      { id: 'errors',            label: 'Error codes'        },  
    ],  
  },  
  {  
    id: 'architecture',  
    label: 'Architecture',  
    sections: [  
      { id: 'system-overview',   label: 'System overview'    },  
      { id: 'indexer',           label: 'Chain indexer'      },  
      { id: 'dual-key',          label: 'Dual-key encryption'},  
      { id: 'webhook-queue',     label: 'Webhook queue'      },  
      { id: 'security-model',    label: 'Security model'     },  
      { id: 'tech-stack',        label: 'Tech stack'         },  
    ],  
  },  
];  
  
// ── Shared doc components ─────────────────────────────────────────────────────  
function DocSection({ id, title, children }) {  
  return (  
    // Increased scroll-mt to 48 (12rem) or 52 to keep space for the nav  
    <section id={id} className="mb-16 scroll-mt-52">   
      <h2 className="text-lg font-bold font-mono uppercase tracking-wide text-white mb-5 pb-3 border-b border-zinc-800/60">  
        {title}  
      </h2>  
      <div className="space-y-4 text-sm text-zinc-200 font-sans normal-case leading-relaxed">  
        {children}  
      </div>  
    </section>  
  );  
}  
  
function SubSection({ title, children }) {  
  return (  
    <div className="mb-6">  
      <h3 className="text-[11px] font-bold font-mono uppercase tracking-widest text-zinc-100 mb-3">  
        {title}  
      </h3>  
      <div className="space-y-3 text-sm text-zinc-200 font-sans normal-case leading-relaxed">  
        {children}  
      </div>  
    </div>  
  );  
}  
  
function InfoBox({ type = 'info', children }) {  
  const styles = {  
    info:    'bg-sky-950/30 border-sky-900/40 text-sky-400/80',  
    warning: 'bg-amber-950/30 border-amber-900/40 text-amber-400/80',  
    success: 'bg-emerald-950/30 border-emerald-900/40 text-emerald-400/80',  
    error:   'bg-rose-950/30 border-rose-900/40 text-rose-400/80',  
  };  
  return (  
    <div className={`px-4 py-3 border text-[11px] font-mono leading-relaxed ${styles[type]}`}>  
      {children}  
    </div>  
  );  
}  
  
function PropTable({ rows }) {  
  return (  
    <div className="overflow-x-auto">  
      <table className="w-full text-[11px] font-mono">  
        <thead>  
          <tr className="border-b border-zinc-800/60">  
            {['Field', 'Type', 'Required', 'Description'].map(h => (  
              <th key={h} className="px-3 py-2 text-left text-[10px] font-bold text-zinc-400 uppercase tracking-widest">  
                {h}  
              </th>  
            ))}  
          </tr>  
        </thead>  
        <tbody>  
          {rows.map((row, i) => (  
            <tr key={i} className={`border-b border-zinc-800/40 ${i % 2 ? 'bg-zinc-900/20' : ''}`}>  
              <td className="px-3 py-2.5 text-sky-400">{row.field}</td>  
              <td className="px-3 py-2.5 text-violet-400">{row.type}</td>  
              <td className="px-3 py-2.5 text-zinc-300">{row.required ? 'Yes' : 'No'}</td>  
              <td className="px-3 py-2.5 text-zinc-200">{row.desc}</td>  
            </tr>  
          ))}  
        </tbody>  
      </table>  
    </div>  
  );  
}  
  
function EndpointBadge({ method }) {  
  const colors = {  
    GET:    'bg-emerald-950/60 text-emerald-400 border-emerald-900/40',  
    POST:   'bg-sky-950/60 text-sky-400 border-sky-900/40',  
    PATCH:  'bg-amber-950/60 text-amber-400 border-amber-900/40',  
    DELETE: 'bg-rose-950/60 text-rose-400 border-rose-900/40',  
  };  
  return (  
    <span className={`inline-flex items-center text-[9px] font-bold font-mono px-2 py-0.5 border uppercase tracking-wide ${colors[method] || colors.GET}`}>  
      {method}  
    </span>  
  );  
}  
  
function Endpoint({ method, path, desc, auth, params, response }) {  
  return (  
    <div className="border border-zinc-800/60 bg-zinc-950/40 mb-4">  
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800/60">  
        <EndpointBadge method={method} />  
        <code className="text-[11px] font-mono text-zinc-100 break-all">{path}</code>  
      </div>  
      <div className="px-4 py-3 space-y-3">  
        <p className="text-[11px] font-mono text-zinc-200">{desc}</p>  
        {auth && (  
          <div className="text-[10px] font-mono text-zinc-400">  
            Auth: <span className="text-amber-400">{auth}</span>  
          </div>  
        )}  
        {params && (  
          <div>  
            <p className="text-[9px] font-bold font-mono text-zinc-400 uppercase tracking-widest mb-1">  
              Body / Query  
            </p>  
            <PropTable rows={params} />  
          </div>  
        )}  
        {response && (  
          <div>  
            <p className="text-[9px] font-bold font-mono text-zinc-400 uppercase tracking-widest mb-1">  
              Response  
            </p>  
            <pre className="text-[10px] font-mono text-zinc-200 bg-zinc-950/60 border border-zinc-800 p-3 overflow-x-auto leading-relaxed">  
              {response}  
            </pre>  
          </div>  
        )}  
      </div>  
    </div>  
  );  
}  
  
function ArchDiagram({ lines }) {  
  return (  
    <div className="bg-zinc-950/60 border border-zinc-800 p-4 font-mono text-[11px] text-zinc-200 leading-relaxed overflow-x-auto">  
      {lines.map((line, i) => (  
        <div key={i} className={line.startsWith('//') ? 'text-sky-400/60' : ''}>  
          {line || '\u00A0'}  
        </div>  
      ))}  
    </div>  
  );  
}  
  
// ── Tab content components ────────────────────────────────────────────────────  
  
function OverviewTab({ activeSectionId }) {  
  const sections = {  
    'what-is-zeroremit': (  
      <DocSection id="what-is-zeroremit" title="What is Zeroremit">  
        <p>  
          Zeroremit is a confidential invoicing protocol built on Ethereum. It enables  
          merchants, freelancers, DAOs, and developers to send and collect payments  
          on-chain without exposing invoice amounts to the public.  
        </p>  
        <p>  
          Invoice amounts are encrypted using <strong className="text-zinc-100">Zama's Fully Homomorphic Encryption (FHE)</strong> directly  
          in the user's browser before any transaction is signed. The encrypted ciphertext  
          is stored on-chain — not the raw number. Only the invoice creator and  
          the designated recipient can request decryption.  
        </p>  
        <p>  
          Beyond invoice creation, Zeroremit includes a full automation layer: burner  
          wallets for server-side signing, scoped API keys, outbound HMAC-signed  
          webhooks, a Telegram bot, and Zapier compatibility.  
        </p>  
        <InfoBox type="info">  
          Zeroremit is currently deployed on Ethereum Sepolia testnet. Mainnet deployment  
          is planned after the FHE coprocessor reaches production stability.  
        </InfoBox>  
      </DocSection>  
    ),  
    'how-it-works': (  
      <DocSection id="how-it-works" title="How it works">  
        <p>The full lifecycle of a Zeroremit invoice:</p>  
        <div className="space-y-3">  
          {[  
            ['Connect wallet',     'User connects an EVM wallet. No account or email required.'],  
            ['Create invoice',     'User selects invoice type, enters recipient, amount, title, and optional due date.'],  
            ['FHE encryption',     'The amount is encrypted in the browser using Zama WASM SDK. An input proof is generated alongside the ciphertext.'],  
            ['Sign transaction',   'Wallet signs a transaction containing only the ciphertext and proof — not the plaintext amount.'],  
            ['On-chain storage',   'PaymentRouter stores the invoice with the encrypted amount handle. The coprocessor verifies the input proof.'],  
            ['Share pay link',     'A unique URL is generated from the invoice ID. The creator shares it with the payer.'],  
            ['Payment',            'Payer opens the link, connects their wallet, and pays in cUSDC. The encrypted amount transfers between balances.'],  
            ['Notification',       'The indexer detects the InvoicePaid event. Telegram bot fires, webhooks dispatch, dashboard updates.'],  
            ['Decryption',         'Creator or recipient can request decryption from the dashboard. Amount is returned only to the browser session.'],  
          ].map(([step, desc], i) => (  
            <div key={step} className="flex gap-4 items-start px-4 py-3 border border-zinc-800/40 bg-zinc-950/40">  
              <span className="text-[10px] font-bold font-mono text-sky-400 flex-shrink-0 w-4">  
                {String(i + 1).padStart(2, '0')}  
              </span>  
              <div>  
                <p className="text-[10px] font-bold font-mono text-zinc-100 uppercase tracking-wide mb-0.5">  
                  {step}  
                </p>  
                <p className="text-[11px] font-mono text-zinc-300">{desc}</p>  
              </div>  
            </div>  
          ))}  
        </div>  
      </DocSection>  
    ),  
    'key-concepts': (  
      <DocSection id="key-concepts" title="Key concepts">  
        <div className="space-y-4">  
          {[  
            {  
              term: 'FHE (Fully Homomorphic Encryption)',  
              def:  'A cryptographic scheme that allows computations to be performed directly on ciphertext without ever decrypting it. Zeroremit uses Zama\'s euint64 type for invoice amounts.',  
            },  
            {  
              term: 'cUSDC (Confidential USDC)',  
              def:  'An FHE-wrapped ERC-20 token. cUSDC balances are encrypted on-chain — even the holder\'s balance is private by default. Payments in Zeroremit are settled in cUSDC.',  
            },  
            {  
              term: 'Burner wallet',  
              def:  'A dedicated Ethereum wallet whose private key is encrypted and stored server-side. Used by automation (Telegram bot, Zapier) to sign invoice creation transactions without requiring MetaMask every time.',  
            },  
            {  
              term: 'Input proof',  
              def:  'A zero-knowledge proof generated alongside the FHE ciphertext confirming the encrypted value is valid without revealing it. Required by the smart contract on submission.',  
            },  
            {  
              term: 'Dual-key encryption',  
              def:  'The burner private key is encrypted twice: once with the user\'s password (client-side) for recovery, and once with a server wrapping key (for automation) using AES-GSM. Disabling automation deletes the server copy.',  
            },  
            {  
              term: 'HMAC-SHA256 signature',  
              def:  'Every outbound webhook delivery is signed. The signature covers the timestamp and raw payload body, allowing the receiver to verify the request came from Zeroremit and was not tampered with.',  
            },  
          ].map(item => (  
            <div key={item.term} className="pl-4 border-l-2 border-zinc-800 py-1">  
              <p className="text-[10px] font-bold font-mono text-zinc-100 uppercase tracking-wide mb-1">  
                {item.term}  
              </p>  
              <p className="text-[11px] font-mono text-zinc-300 leading-relaxed">{item.def}</p>  
            </div>  
          ))}  
        </div>  
      </DocSection>  
    ),  
    'network': (  
      <DocSection id="network" title="Network & tokens">  
        <SubSection title="Network">  
          <p>Zeroremit is deployed on <strong className="text-zinc-100">Ethereum Sepolia</strong> (Chain ID: 11155111).</p>  
          <p>The Zama FHE coprocessor operates at Gateway Chain ID 10901 and is accessible via the Zama relayer at <code className="text-sky-400 text-[11px]">relayer.testnet.zama.org</code>.</p>  
        </SubSection>  
        <SubSection title="Tokens">  
          <div className="space-y-2">  
            {[  
              ['USDC',  'Standard ERC-20. Used to top up cUSDC by wrapping (shielding).'],  
              ['cUSDC', 'FHE-wrapped USDC. Used for all invoice payments. Balances are encrypted on-chain.'],  
            ].map(([token, desc]) => (  
              <div key={token} className="flex gap-3 px-3 py-2 border border-zinc-800/40 bg-zinc-950/40">  
                <code className="text-[11px] font-mono text-emerald-400 flex-shrink-0 w-14">{token}</code>  
                <p className="text-[11px] font-mono text-zinc-300">{desc}</p>  
              </div>  
            ))}  
          </div>  
        </SubSection>  
        <SubSection title="Contract addresses (Sepolia)">  
          <InfoBox type="warning">  
            Contract addresses are specific to the Sepolia deployment. Always verify against the  
            addresses.json file in the frontend repository before integrating.  
          </InfoBox>  
        </SubSection>  
      </DocSection>  
    ),  
    'privacy-model': (  
      <DocSection id="privacy-model" title="Privacy model">  
        <p>  
          Zeroremit protects <strong className="text-zinc-100">invoice amounts only</strong>. Wallet addresses,  
          transaction timestamps, and the fact that a payment occurred are all visible  
          on-chain to anyone with a block explorer.  
        </p>  
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-4">  
          <div className="p-4 border border-emerald-900/30 bg-emerald-950/10">  
            <p className="text-[9px] font-bold font-mono text-emerald-400 uppercase tracking-widest mb-2">  
              What is private  
            </p>  
            {['Invoice amount', 'cUSDC balance', 'Individual donation amounts'].map(s => (  
              <div key={s} className="flex items-center gap-2 py-1">  
                <span className="w-1.5 h-1.5 bg-emerald-400 flex-shrink-0"/>  
                <span className="text-[11px] font-mono text-zinc-200">{s}</span>  
              </div>  
            ))}  
          </div>  
          <div className="p-4 border border-rose-900/30 bg-rose-950/10">  
            <p className="text-[9px] font-bold font-mono text-rose-400 uppercase tracking-widest mb-2">  
              What is public  
            </p>  
            {['Creator wallet address', 'Recipient wallet address', 'Invoice existence', 'Payment timestamp', 'Transaction hash'].map(s => (  
              <div key={s} className="flex items-center gap-2 py-1">  
                <span className="w-1.5 h-1.5 bg-rose-400 flex-shrink-0"/>  
                <span className="text-[11px] font-mono text-zinc-200">{s}</span>  
              </div>  
            ))}  
          </div>  
        </div>  
        <InfoBox type="info">  
          Decryption is always voluntary and happens in the browser. Neither Zeroremit's  
          backend nor the smart contract ever stores a decrypted amount.  
        </InfoBox>  
      </DocSection>  
    ),  
  };  
  
  return <>{sections[activeSectionId] || sections['what-is-zeroremit']}</>;  
}  
  
function ContractsTab({ activeSectionId }) {  
  const sections = {  
    'payment-router': (  
      <DocSection id="payment-router" title="PaymentRouter">  
        <p>  
          The central contract for all invoice operations. Handles creation,  
          payment, and cancellation of both single-recipient and multi-payer invoices.  
        </p>  
        <SubSection title="Responsibilities">  
          <ul className="space-y-1.5">  
            {[  
              'Create single invoices with one named recipient and an encrypted amount',  
              'Create multi-item invoices open to multiple payers',  
              'Accept payment in cUSDC from the designated recipient',  
              'Transfer the encrypted amount to the creator on payment',  
              'Allow creators to cancel pending invoices',  
              'Track invoice status: Pending (0), Paid (1), Cancelled (2), Expired (3)',  
            ].map((item, i) => (  
              <li key={i} className="flex gap-2.5 items-start text-[11px] font-mono text-zinc-200">  
                <span className="text-sky-400 flex-shrink-0">·</span>  
                {item}  
              </li>  
            ))}  
          </ul>  
        </SubSection>  
        <SubSection title="Key functions">  
          <div className="space-y-2">  
            {[  
              { fn: 'createSingleInvoice(recipient, encAmount, proof, title, memo, dueAt)', desc: 'Create a private invoice for one recipient. Amount is FHE-encrypted.' },  
              { fn: 'createMultiInvoice(itemCount, amounts[], title, memo, dueAt)',          desc: 'Create an open invoice with visible line item amounts.' },  
              { fn: 'payInvoice(invoiceId)',                                                  desc: 'Recipient pays a single invoice. Transfers cUSDC to creator.' },  
              { fn: 'payInvoiceItem(invoiceId, itemIndex)',                                   desc: 'Pay one item of a multi-payer invoice.' },  
              { fn: 'cancelInvoice(invoiceId)',                                               desc: 'Creator cancels a pending invoice.' },  
              { fn: 'getInvoice(invoiceId)',                                                  desc: 'Read invoice metadata. Does not return the decrypted amount.' },  
            ].map(item => (  
              <div key={item.fn} className="px-3 py-2 border border-zinc-800/40 bg-zinc-950/40">  
                <code className="text-[10px] font-mono text-sky-400 block mb-1 break-all">{item.fn}</code>  
                <p className="text-[11px] font-mono text-zinc-300">{item.desc}</p>  
              </div>  
            ))}  
          </div>  
        </SubSection>  
      </DocSection>  
    ),  
    'donation-vault': (  
      <DocSection id="donation-vault" title="DonationVault">  
        <p>  
          Manages donation pages with optional funding goals and end dates.  
          Individual donation amounts are encrypted by the donor's browser before submission.  
        </p>  
        <SubSection title="Key functions">  
          <div className="space-y-2">  
            {[  
              { fn: 'createPage(goal, endsAt, title, memo)',              desc: 'Create a donation page. Goal is optional and publicly visible.' },  
              { fn: 'donate(pageId, encAmount, proof)',                    desc: 'Donate to a page. Amount is FHE-encrypted by the donor.' },  
              { fn: 'getPage(pageId)',                                     desc: 'Read page metadata including creator, goal, and end date.' },  
            ].map(item => (  
              <div key={item.fn} className="px-3 py-2 border border-zinc-800/40 bg-zinc-950/40">  
                <code className="text-[10px] font-mono text-sky-400 block mb-1 break-all">{item.fn}</code>  
                <p className="text-[11px] font-mono text-zinc-300">{item.desc}</p>  
              </div>  
            ))}  
          </div>  
        </SubSection>  
      </DocSection>  
    ),  
    'cusdc': (  
      <DocSection id="cusdc" title="ConfidentialUSDC">  
        <p>  
          An FHE-wrapped ERC-20 token built on Zama's confidential token standard.  
          All balances are encrypted on-chain using euint64.  
        </p>  
        <SubSection title="Key operations">  
          <div className="space-y-2">  
            {[  
              { fn: 'wrap(to, amount)',                           desc: 'Convert plain USDC to cUSDC. Requires USDC approval first.' },  
              { fn: 'unwrap(from, to, encAmount, proof)',         desc: 'Convert cUSDC back to plain USDC. Amount must be FHE-encrypted.' },  
              { fn: 'confidentialBalanceOf(account)',             desc: 'Returns the encrypted balance handle. Decryption requires wallet signature.' },  
              { fn: 'setOperator(operator, until)',               desc: 'Grant another contract permission to move your cUSDC for a time-limited period.' },  
            ].map(item => (  
              <div key={item.fn} className="px-3 py-2 border border-zinc-800/40 bg-zinc-950/40">  
                <code className="text-[10px] font-mono text-sky-400 block mb-1 break-all">{item.fn}</code>  
                <p className="text-[11px] font-mono text-zinc-300">{item.desc}</p>  
              </div>  
            ))}  
          </div>  
        </SubSection>  
        <InfoBox type="warning">  
          Before any cUSDC operation, you must first wrap USDC. Plain USDC is required  
          to top up your cUSDC balance. The wrap operation requires an ERC-20 approve call first.  
        </InfoBox>  
      </DocSection>  
    ),  
    'invoice-types': (  
      <DocSection id="invoice-types" title="Invoice types">  
        <div className="space-y-4">  
          {[  
            {  
              type:  'Single (kind = 0)',  
              color: 'border-l-sky-500',  
              items: [  
                'One creator, one named recipient',  
                'Amount encrypted in creator browser (euint64)',  
                'Only the designated recipient can pay',  
                'Only creator and recipient can decrypt the amount',  
                'Creator can cancel before payment',  
              ],  
            },  
            {  
              type:  'Multi-item (kind = 1)',  
              color: 'border-l-violet-500',  
              items: [  
                'One creator, multiple possible payers',  
                'Line item amounts are publicly visible',  
                'Any wallet can pay any unpaid item',  
                'Invoice is paid when all items are settled',  
                'Suitable for team expense splits and group purchases',  
              ],  
            },  
            {  
              type:  'Donation page',  
              color: 'border-l-emerald-500',  
              items: [  
                'Creator launches a page with an optional goal and end date',  
                'Each donor encrypts their own amount in their browser',  
                'Individual donation amounts are private',  
                'Page creator receives all donations',  
                'Page expires automatically at the end date',  
              ],  
            },  
          ].map(item => (  
            <div key={item.type} className={`pl-4 border-l-2 ${item.color} py-2`}>  
              <p className="text-[10px] font-bold font-mono text-zinc-100 uppercase tracking-wide mb-2">  
                {item.type}  
              </p>  
              <ul className="space-y-1">  
                {item.items.map((s, i) => (  
                  <li key={i} className="flex gap-2 text-[11px] font-mono text-zinc-300">  
                    <span className="text-sky-400 flex-shrink-0">·</span>  
                    {s}  
                  </li>  
                ))}  
              </ul>  
            </div>  
          ))}  
        </div>  
      </DocSection>  
    ),  
    'invoice-lifecycle': (  
      <DocSection id="invoice-lifecycle" title="Invoice lifecycle">  
        <ArchDiagram lines={[  
          'Created (status: 0 — Pending)',  
          '     │',  
          '     ├── Recipient pays ──────────────► Paid (status: 1)',  
          '     │',  
          '     ├── Creator cancels ─────────────► Cancelled (status: 2)',  
          '     │',  
          '     └── dueAt passes, unpaid ─────────► Expired (status: 3)',  
        ]} />  
        <p className="mt-4">  
          Status transitions are permanent and recorded on-chain.  
          A paid, cancelled, or expired invoice cannot change state.  
        </p>  
      </DocSection>  
    ),  
    'events': (  
      <DocSection id="events" title="Events">  
        <div className="space-y-2">  
          {[  
            { event: 'SingleInvoiceCreated(invoiceId, creator, recipient, dueAt)',  contract: 'PaymentRouter' },  
            { event: 'MultiInvoiceCreated(invoiceId, creator, itemCount, dueAt)',   contract: 'PaymentRouter' },  
            { event: 'InvoicePaid(invoiceId, lastPayer)',                            contract: 'PaymentRouter' },  
            { event: 'InvoiceItemPaid(invoiceId, itemIndex, payer)',                 contract: 'PaymentRouter' },  
            { event: 'InvoiceCancelled(invoiceId)',                                  contract: 'PaymentRouter' },  
            { event: 'InvoiceExpired(invoiceId)',                                    contract: 'PaymentRouter' },  
            { event: 'PageCreated(pageId, creator, goal, endsAt)',                   contract: 'DonationVault' },  
            { event: 'DonationReceived(pageId, donor)',                              contract: 'DonationVault' },  
          ].map(item => (  
            <div key={item.event} className="flex flex-col sm:flex-row items-start gap-3 px-3 py-2 border border-zinc-800/40 bg-zinc-950/40">  
              <code className="text-[10px] font-mono text-sky-400 flex-1 break-all">{item.event}</code>  
              <span className="text-[9px] font-mono text-zinc-400 flex-shrink-0">{item.contract}</span>  
            </div>  
          ))}  
        </div>  
        <InfoBox type="info">  
          The chain indexer polls for these events every 15 seconds and writes them to the  
          backend database. Webhooks and Telegram notifications are fired from the indexer  
          after each event is processed.  
        </InfoBox>  
      </DocSection>  
    ),  
  };  
  
  return <>{sections[activeSectionId] || sections['payment-router']}</>;  
}  
  
function ZamaTab({ activeSectionId }) {  
  const sections = {  
    'fhe-overview': (  
      <DocSection id="fhe-overview" title="FHE overview">  
        <p>  
          Fully Homomorphic Encryption (FHE) allows computations to be performed  
          directly on encrypted data without decrypting it first. The result of the  
          computation is still encrypted — and decrypts to the correct answer.  
        </p>  
        <p>  
          Zeroremit uses Zama's <strong className="text-zinc-100">fhEVM</strong> — a version  
          of the Ethereum Virtual Machine that natively supports FHE operations.  
          Invoice amounts are stored as <code className="text-sky-400 text-[11px]">euint64</code> values  
          (64-bit encrypted unsigned integers).  
        </p>  
        <SubSection title="Why FHE instead of zk-proofs or commit-reveal">  
          <div className="space-y-2">  
            {[  
              ['Zero-knowledge proofs', 'Prove a statement is true without revealing data. But the data itself is not encrypted on-chain — it would still be visible if someone reconstructed the input.'],  
              ['Commit-reveal',         'Hash the value first, reveal later. Cheap but the value becomes public at reveal time. Not suitable for persistent invoice privacy.'],  
              ['FHE',                   'The value is encrypted on-chain permanently. The contract can perform operations on the ciphertext. Decryption requires an explicit authorized request — it never happens automatically.'],  
            ].map(([scheme, desc]) => (  
              <div key={scheme} className="pl-4 border-l-2 border-zinc-800 py-1">  
                <p className="text-[10px] font-bold font-mono text-zinc-100 uppercase tracking-wide mb-1">{scheme}</p>  
                <p className="text-[11px] font-mono text-zinc-300">{desc}</p>  
              </div>  
            ))}  
          </div>  
        </SubSection>  
      </DocSection>  
    ),  
    'encryption-flow': (  
      <DocSection id="encryption-flow" title="Encryption flow">  
        <p>Encryption happens in the browser before any wallet interaction.</p>  
        <ArchDiagram lines={[  
          '1. User enters amount (e.g. 500)',  
          '2. Zama WASM SDK loads in browser',  
          '3. createInstance(sepoliaConfig) initializes the relayer connection',  
          '4. instance.createEncryptedInput(contractAddress, userAddress)',  
          '5. input.add64(parseUnits(amount, 6))',  
          '6. const { handles, inputProof } = await input.encrypt()',  
          '7. handles[0]  → 32-byte ciphertext handle (sent to contract)',  
          '8. inputProof  → ZK proof (sent to contract alongside handle)',  
          '',  
          '// The number 500 never leaves the browser as plaintext',  
        ]} />  
        <InfoBox type="info">  
          The ciphertext handle is bound to both the contract address and your wallet address.  
          This means the handle is only usable with that specific contract and can only  
          be decrypted by an authorized party through that wallet.  
        </InfoBox>  
      </DocSection>  
    ),  
    'decryption-flow': (  
      <DocSection id="decryption-flow" title="Decryption flow">  
        <p>  
          Decryption is always on-demand and requires a wallet signature to prove  
          authorization. It never happens automatically.  
        </p>  
        <ArchDiagram lines={[  
          '1. User clicks Decrypt in the dashboard',  
          '2. Zama SDK fetches the ciphertext handle from the contract',  
          '3. SDK requests a reencryption via the Zama gateway',  
          '4. User signs a message with their wallet',  
          '   (proves they are authorized to decrypt this handle)',  
          '5. Gateway verifies the signature against the ACL contract',  
          '6. Gateway returns the decrypted value encrypted under',  
          '   the user public key',  
          '7. SDK decrypts locally in the browser',  
          '8. Plaintext amount displayed — never stored anywhere',  
        ]} />  
      </DocSection>  
    ),  
    'server-side-fhe': (  
      <DocSection id="server-side-fhe" title="Server-side FHE">  
        <p>  
          When the Telegram bot or Zapier creates an invoice via the public API,  
          the server performs the FHE encryption using the Node.js build of the  
          Zama Relayer SDK — since the browser is not involved.  
        </p>  
        <SubSection title="How it works">  
          <div className="space-y-2 text-[11px] font-mono text-zinc-200">  
            <p>The server uses <code className="text-sky-400">createInstance</code> from <code className="text-sky-400">@zama-fhe/relayer-sdk/node</code>.</p>  
            <p>The burner wallet address is used as the <code className="text-sky-400">userAddress</code> parameter when creating the encrypted input — binding the ciphertext to the burner.</p>  
            <p>The resulting handle and proof are passed directly to the contract write call.</p>  
            <p>The decrypted key is held in memory only for the duration of the signing call and immediately discarded.</p>  
          </div>  
        </SubSection>  
        <InfoBox type="warning">  
          Server-side FHE binds the ciphertext to the burner wallet address, not the user's  
          main wallet. The burner is the invoice creator on-chain when automation is used.  
        </InfoBox>  
      </DocSection>  
    ),  
    'fhe-limits': (  
      <DocSection id="fhe-limits" title="Limits & caveats">  
        <div className="space-y-3">  
          {[  
            { title: 'euint64 maximum',   desc: 'The maximum representable value is 18,446,744,073,709,551,615 — far larger than any practical USDC invoice amount at 6 decimals.' },  
            { title: 'WASM load time',    desc: 'The Zama SDK loads WebAssembly in the browser. First initialization takes 2 to 5 seconds. Subsequent operations are fast. The app warms up the SDK on page load.' },  
            { title: 'Sepolia only',      desc: 'The Zama coprocessor and gateway are only deployed on Sepolia testnet. Mainnet support is on the Zama roadmap.' },  
            { title: 'ACL authorization', desc: 'The ciphertext handle is bound to a specific contract and wallet. Handles are not transferable between contracts or users.' },  
            { title: 'Relay dependency',  desc: 'Encryption and decryption require a live connection to the Zama relayer at relayer.testnet.zama.org. If the relayer is unavailable, these operations will fail.' },  
          ].map(item => (  
            <div key={item.title} className="pl-4 border-l-2 border-amber-900/60 py-1">  
              <p className="text-[10px] font-bold font-mono text-amber-400 uppercase tracking-wide mb-1">{item.title}</p>  
              <p className="text-[11px] font-mono text-zinc-300">{item.desc}</p>  
            </div>  
          ))}  
        </div>  
      </DocSection>  
    ),  
  };  
  
  return <>{sections[activeSectionId] || sections['fhe-overview']}</>;  
}  
  
function IntegrationsTab({ activeSectionId }) {  
  const sections = {  
    'telegram-bot': (  
      <DocSection id="telegram-bot" title="Telegram bot">  
        <p>  
          The Zeroremit Telegram bot lets users receive payment notifications,  
          check invoice status, query balances, and create invoices directly  
          from Telegram chat — without opening the web app.  
        </p>  
        <SubSection title="Setup">  
          <div className="space-y-2">  
            {[  
              '1. Open Dashboard and go to the Automation tab.',  
              '2. Create a burner wallet and set a password.',  
              '3. Generate an API key under API Keys.',  
              '4. Go to Integrations then Telegram API and generate a link code.',  
              '5. Send /link CODE to the bot in Telegram.',  
              '6. Send /apikey YOUR_KEY to the bot to register the key.',  
              '7. You can now use /create directly in Telegram.',  
            ].map((s, i) => (  
              <p key={i} className="text-[11px] font-mono text-zinc-200">{s}</p>  
            ))}  
          </div>  
        </SubSection>  
        <SubSection title="Available commands">  
          <div className="space-y-1.5">  
            {[  
              ['/start',                          'Welcome message and getting started'],  
              ['/link CODE',                      'Link wallet using a one-time code from the web app'],  
              ['/unlink',                         'Disconnect wallet from this Telegram account'],  
              ['/address',                        'Show linked wallet address'],  
              ['/apikey KEY',                     'Register API key to enable /create and /pay'],  
              ['/balance',                        'Check current USDC balance (on-chain read)'],  
              ['/invoices',                       'List 5 most recent invoices'],  
              ['/invoices STATUS',                'Filter: pending, paid, cancelled, expired'],  
              ['/status ID',                      'Full invoice details from on-chain'],  
              ['/create AMOUNT RECIPIENT TITLE',  'Create invoice via burner wallet'],  
              ['/pay ID',                         'View invoice and confirm payment via burner'],  
              ['/confirmpay ID',                  'Submit the payment after reviewing with /pay'],  
              ['/donate ID',                      'Open donation page link'],  
              ['/alerts on or off',               'Toggle all payment notifications'],  
              ['/mute DURATION',                  'Silence alerts temporarily (e.g. 1h, 8h, 1d)'],  
            ].map(([cmd, desc]) => (  
              <div key={cmd} className="flex flex-col sm:flex-row items-start gap-3 px-3 py-2 border border-zinc-800/40 bg-zinc-950/40">  
                <code className="text-[10px] font-mono text-sky-400 flex-shrink-0 sm:w-52 break-all">{cmd}</code>  
                <p className="text-[11px] font-mono text-zinc-300">{desc}</p>  
              </div>  
            ))}  
          </div>  
        </SubSection>  
        <InfoBox type="info">  
          Invoice creation and payment via Telegram requires a burner wallet with automation  
          enabled and an API key registered with /apikey. Without these, the bot directs  
          users to the web app for all transaction operations.  
        </InfoBox>  
      </DocSection>  
    ),  
    'zapier': (  
      <DocSection id="zapier" title="Zapier">  
        <p>  
          Zeroremit works with Zapier generic Webhooks by Zapier step.  
          No custom Zapier app is required.  
        </p>  
        <SubSection title="Outbound (invoice events to Zapier)">  
          <p>  
            Register a Zapier Catch Hook URL in the Webhooks tab under  
            Integrations then Zapier and Webhooks. Select the events you want  
            (e.g. invoice.paid). When an invoice is paid, Zeroremit fires a  
            signed HTTP POST to Zapier. Zapier receives the payload and can  
            route it to Slack, Google Sheets, Gmail, Airtable, or any of  
            its 6,000+ apps.  
          </p>  
        </SubSection>  
        <SubSection title="Inbound (Facebook Lead Ads to create invoice)">  
          <p>  
            Use Zapier Webhooks by Zapier POST action to call  
            <code className="text-sky-400 text-[11px]"> POST /api/public/invoices</code> with  
            your API key in the Authorization header. When a new Facebook Lead  
            Ad form is submitted, Zapier reads the lead fields, maps them to  
            the invoice body, and creates an invoice automatically via your  
            burner wallet.  
          </p>  
        </SubSection>  
        <InfoBox type="info">  
          See the Setup Guide tab inside Integrations then Zapier and Webhooks  
          for step-by-step Zapier configuration including Slack, Discord,  
          and Facebook Lead Ads.  
        </InfoBox>  
      </DocSection>  
    ),  
    'webhooks': (  
      <DocSection id="webhooks" title="Webhooks">  
        <p>  
          Outbound webhooks fire HMAC-SHA256 signed HTTP POST requests to  
          registered HTTPS endpoints whenever on-chain events occur.  
        </p>  
        <SubSection title="Event types">  
          <div className="space-y-1">  
            {[  
              ['invoice.created',   'New invoice created on-chain'],  
              ['invoice.paid',      'Invoice fully paid'],  
              ['invoice.cancelled', 'Invoice cancelled by creator'],  
              ['invoice.expired',   'Invoice passed due date unpaid'],  
              ['donation.received', 'New donation on a page'],  
            ].map(([ev, desc]) => (  
              <div key={ev} className="flex gap-3 px-3 py-2 border border-zinc-800/40 bg-zinc-950/40">  
                <code className="text-[10px] font-mono text-sky-400 w-36 flex-shrink-0">{ev}</code>  
                <p className="text-[11px] font-mono text-zinc-300">{desc}</p>  
              </div>  
            ))}  
          </div>  
        </SubSection>  
        <SubSection title="Signature verification">  
          <p>  
            Every delivery includes three headers: <code className="text-sky-400 text-[11px]">X-Zeroremit-Signature</code>,{' '}  
            <code className="text-sky-400 text-[11px]">X-Zeroremit-Timestamp</code>, and{' '}  
            <code className="text-sky-400 text-[11px]">X-Zeroremit-Event</code>.  
          </p>  
          <p>  
            The signature is computed as <code className="text-sky-400 text-[11px]">HMAC-SHA256(secret, timestamp + "." + rawBody)</code>.  
            Always use the raw request body — not re-serialized JSON — for verification.  
            Reject requests where the timestamp is more than 5 minutes old.  
          </p>  
        </SubSection>  
        <SubSection title="Retry schedule">  
          <p>Failed deliveries are retried up to 10 times with exponential backoff:  
            immediate, 30s, 2m, 10m, 30m, 1h, 3h, 6h, 12h, 24h.  
            After 10 consecutive failures the endpoint is auto-disabled.  
          </p>  
        </SubSection>  
      </DocSection>  
    ),  
    'burner-wallets': (  
      <DocSection id="burner-wallets" title="Burner wallets">  
        <p>  
          A burner wallet is a dedicated Ethereum wallet whose private key is  
          encrypted and stored server-side. It allows automation systems to  
          sign transactions without requiring the user main wallet every time.  
        </p>  
        <SubSection title="Dual-key encryption">  
          <p>  
            The private key is encrypted twice: once with the user password  
            in the browser (for recovery), and once with a server wrapping key  
            (for automation). Disabling automation deletes the server-side copy.  
            The user-side encrypted blob remains for manual recovery.  
          </p>  
        </SubSection>  
        <SubSection title="What the burner can do">  
          <ul className="space-y-1">  
            {[  
              'Sign createSingleInvoice transactions on the user behalf',  
              'Sign payInvoice transactions within the user API key caps',  
              'Act as the invoice creator on-chain (burner address appears as creator)',  
            ].map((s, i) => (  
              <li key={i} className="flex gap-2 text-[11px] font-mono text-zinc-200">  
                <span className="text-sky-400">·</span>{s}  
              </li>  
            ))}  
          </ul>  
        </SubSection>  
        <SubSection title="What the burner cannot do">  
          <ul className="space-y-1">  
            {[  
              'Act after the user disables automation (server key is deleted)',  
              'Exceed the API key per-invoice or daily USDC caps',  
              'Access any other user data or wallet',  
            ].map((s, i) => (  
              <li key={i} className="flex gap-2 text-[11px] font-mono text-zinc-200">  
                <span className="text-rose-400">·</span>{s}  
              </li>  
            ))}  
          </ul>  
        </SubSection>  
        <InfoBox type="warning">  
          The burner needs Sepolia ETH for gas. Fund the burner address from the  
          Dashboard then Automation tab after creation.  
        </InfoBox>  
      </DocSection>  
    ),  
    'api-keys': (  
      <DocSection id="api-keys" title="API keys">  
        <p>  
          API keys are scoped Bearer tokens that authorize external systems to  
          call the public invoice API on a user behalf. Each key has spending  
          caps that are enforced before any transaction is signed.  
        </p>  
        <SubSection title="Caps">  
          <div className="space-y-1">  
            {[  
              ['maxAmountUsdc',   'Maximum USDC per single invoice (default $500)'],  
              ['dailyLimitUsdc',  'Maximum USDC total across all invoices per 24h (default $2,000)'],  
              ['usedTodayUsdc',   'Rolling counter, lazy-reset after 24h'],  
            ].map(([field, desc]) => (  
              <div key={field} className="flex gap-3 px-3 py-2 border border-zinc-800/40 bg-zinc-950/40">  
                <code className="text-[10px] font-mono text-sky-400 w-36 flex-shrink-0">{field}</code>  
                <p className="text-[11px] font-mono text-zinc-300">{desc}</p>  
              </div>  
            ))}  
          </div>  
        </SubSection>  
        <InfoBox type="info">  
          API keys are shown exactly once on creation and stored as SHA-256 hashes.  
          If a key is lost, revoke it and generate a new one.  
        </InfoBox>  
      </DocSection>  
    ),  
  };  
  
  return <>{sections[activeSectionId] || sections['telegram-bot']}</>;  
}  
  
function ApiTab({ activeSectionId }) {  
  const sections = {  
    'authentication': (  
      <DocSection id="authentication" title="Authentication">  
        <p>  
          The public API uses Bearer token authentication. Pass your API key  
          in the Authorization header on every request.  
        </p>  
        <div className="bg-zinc-950/60 border border-zinc-800 px-4 py-3 font-mono text-[11px] text-zinc-200 mb-4 break-all">  
          Authorization: Bearer zr_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  
        </div>  
        <InfoBox type="warning">  
          Keep your API key secret. Anyone with the key can create invoices  
          within your configured caps until the key is revoked.  
        </InfoBox>  
      </DocSection>  
    ),  
    'public-invoices': (  
      <DocSection id="public-invoices" title="POST /api/public/invoices">  
        <p>Create an invoice using the caller burner wallet. Requires an active API key.</p>  
        <Endpoint  
          method="POST"  
          path="/api/public/invoices"  
          desc="Create a single invoice. The burner wallet signs the on-chain transaction. FHE-encrypts the amount server-side."  
          auth="Bearer API key"  
          params={[  
            { field: 'recipient', type: 'string',  required: true,  desc: '0x Ethereum address of the invoice recipient' },  
            { field: 'amount',    type: 'string',  required: true,  desc: 'USDC amount as a string e.g. "50.00"' },  
            { field: 'title',     type: 'string',  required: true,  desc: 'Invoice title, max 200 characters' },  
            { field: 'memo',      type: 'string',  required: false, desc: 'Optional memo or note, max 500 characters' },  
            { field: 'dueAt',     type: 'number',  required: false, desc: 'Unix timestamp (seconds) for invoice due date' },  
          ]}  
          response={`{
  "invoiceId": "0x...",
  "txHash":    "0x...",
  "creator":   "0x<burner address>",
  "recipient": "0x...",
  "amount":    "50.00",
  "title":     "Invoice #42",
  "payUrl":    "https://yourapp.com/pay/0x...",
  "usage": {
    "usedTodayUsdc":  75,
    "dailyLimitUsdc": 2000
  }
}`}  
        />  
        <SubSection title="Error codes">  
          <div className="space-y-1">  
            {[  
              ['400', 'Validation failure, missing body, or no burner for this API key'],  
              ['401', 'Missing, malformed, invalid, or revoked API key'],  
              ['403', 'Amount exceeds per-invoice cap, daily limit hit, or automation disabled'],  
              ['500', 'FHE encryption failed, contract revert, or RPC error'],  
            ].map(([code, desc]) => (  
              <div key={code} className="flex gap-3 px-3 py-2 border border-zinc-800/40 bg-zinc-950/40">  
                <code className="text-[10px] font-mono text-rose-400 w-8 flex-shrink-0">{code}</code>  
                <p className="text-[11px] font-mono text-zinc-300">{desc}</p>  
              </div>  
            ))}  
          </div>  
        </SubSection>  
      </DocSection>  
    ),  
    'burner-endpoints': (  
      <DocSection id="burner-endpoints" title="Burner endpoints">  
        <p>Manage burner wallets. All routes trust the wallet field in the request body.</p>  
        <Endpoint method="POST" path="/api/burner/create"  
          desc="Store new burner. Server encrypts raw key with wrapping key, discards plaintext."  
          params={[  
            { field: 'wallet',            type: 'string', required: true,  desc: 'Main wallet address (owner)' },  
            { field: 'burnerAddress',     type: 'string', required: true,  desc: 'Ethereum address of the burner' },  
            { field: 'encryptedKey_user', type: 'string', required: true,  desc: 'AES-GCM blob from browser (password-encrypted)' },  
            { field: 'rawPrivateKey',     type: 'string', required: true,  desc: '0x-prefixed hex private key, sent once' },  
          ]}  
        />  
        <Endpoint method="GET"  path="/api/burner?wallet=0x..." desc="Returns burner metadata. Never returns encrypted blobs." />  
        <Endpoint method="POST" path="/api/burner/disable-automation" desc="Deletes encryptedKey_server. Server can no longer sign." params={[{ field: 'wallet', type: 'string', required: true, desc: 'Owner wallet' }]} />  
        <Endpoint method="POST" path="/api/burner/enable-automation" desc="Re-encrypts server key. User must decrypt user blob first." params={[{ field: 'wallet', type: 'string', required: true, desc: 'Owner wallet' }, { field: 'rawPrivateKey', type: 'string', required: true, desc: 'Decrypted key from browser' }]} />  
        <Endpoint method="DELETE" path="/api/burner" desc="Full removal. Cascades to all API keys." params={[{ field: 'wallet', type: 'string', required: true, desc: 'Owner wallet' }]} />  
      </DocSection>  
    ),  
    'key-endpoints': (  
      <DocSection id="key-endpoints" title="API key endpoints">  
        <Endpoint method="POST" path="/api/burner/keys"  
          desc="Generate a new API key. Returns plaintext key ONCE. Requires burner to exist."  
          params={[  
            { field: 'wallet',          type: 'string', required: true,  desc: 'Owner wallet' },  
            { field: 'label',           type: 'string', required: false, desc: 'Human-readable label' },  
            { field: 'maxAmountUsdc',   type: 'number', required: false, desc: 'Per-invoice cap (default 500)' },  
            { field: 'dailyLimitUsdc',  type: 'number', required: false, desc: 'Daily cap (default 2000)' },  
          ]}  
          response={`{
  "id":             "clx9k2j3m...",
  "key":            "zr_live_...",
  "label":          "Zapier integration",
  "maxAmountUsdc":  500,
  "dailyLimitUsdc": 2000,
  "createdAt":      "1735689600000"
}`}  
        />  
        <Endpoint method="GET"    path="/api/burner/keys?wallet=0x..." desc="List all keys. No plaintext or hashes returned." />  
        <Endpoint method="DELETE" path="/api/burner/keys/:id"          desc="Soft-delete. Sets revokedAt. Key stops working immediately." params={[{ field: 'wallet', type: 'string', required: true, desc: 'Owner wallet' }]} />  
      </DocSection>  
    ),  
    'webhook-endpoints': (  
      <DocSection id="webhook-endpoints" title="Webhook endpoints">  
        <Endpoint method="POST" path="/api/webhooks"  
          desc="Register a new endpoint. Returns signing secret ONCE."  
          params={[  
            { field: 'wallet', type: 'string',   required: true, desc: 'Owner wallet' },  
            { field: 'url',    type: 'string',   required: true, desc: 'HTTPS destination URL' },  
            { field: 'events', type: 'string[]', required: true, desc: 'Array of event names to subscribe to' },  
          ]}  
        />  
        <Endpoint method="GET"    path="/api/webhooks?wallet=0x..."         desc="List all endpoints. Secret never returned." />  
        <Endpoint method="PATCH"  path="/api/webhooks/:id"                  desc="Update url, events, or active status. Resets failCount on re-enable." params={[{ field: 'wallet', type: 'string', required: true, desc: 'Owner wallet' }, { field: 'url', type: 'string', required: false, desc: 'New URL' }, { field: 'events', type: 'string[]', required: false, desc: 'New event list' }, { field: 'active', type: 'boolean', required: false, desc: 'Toggle endpoint on or off' }]} />  
        <Endpoint method="DELETE" path="/api/webhooks/:id"                  desc="Soft-delete. Cascades pending deliveries to dead." params={[{ field: 'wallet', type: 'string', required: true, desc: 'Owner wallet' }]} />  
        <Endpoint method="POST"   path="/api/webhooks/:id/test"             desc="Enqueue a dummy payload through the full worker pipeline." params={[{ field: 'wallet', type: 'string', required: true, desc: 'Owner wallet' }]} />  
        <Endpoint method="GET"    path="/api/webhooks/:id/deliveries?wallet=0x..." desc="Last 20 delivery attempts for this endpoint." />  
      </DocSection>  
    ),  
    'telegram-endpoints': (  
      <DocSection id="telegram-endpoints" title="Telegram endpoints">  
        <Endpoint method="POST" path="/api/telegram/link-code"          desc="Generate a one-time link code (10 min TTL)." params={[{ field: 'wallet', type: 'string', required: true, desc: 'Wallet to link' }]} response={`{ "code": "zr_a8f3k2x9", "expiresAt": "1735689600000" }`} />  
        <Endpoint method="GET"  path="/api/telegram/status?wallet=0x..." desc="Check if wallet is linked and return notification preferences." />  
        <Endpoint method="POST" path="/api/telegram/unlink"              desc="Remove the Telegram link for a wallet." params={[{ field: 'wallet', type: 'string', required: true, desc: 'Wallet to unlink' }]} />  
        <Endpoint method="POST" path="/api/telegram/prefs"               desc="Update notification preferences." params={[{ field: 'wallet', type: 'string', required: true, desc: 'Linked wallet' }, { field: 'prefs', type: 'object', required: true, desc: 'Partial prefs object e.g. { invoicePaid: true }' }]} />  
      </DocSection>  
    ),  
    'errors': (  
      <DocSection id="errors" title="Error codes">  
        <div className="space-y-1.5">  
          {[  
            ['400', 'Bad Request',           'Missing or invalid request body parameters'],  
            ['401', 'Unauthorized',          'Missing, invalid, or revoked API key or Bearer token'],  
            ['403', 'Forbidden',             'Cap exceeded, automation disabled, or insufficient permissions'],  
            ['404', 'Not Found',             'Resource does not exist or belongs to a different wallet'],  
            ['500', 'Internal Server Error', 'FHE failure, contract revert, RPC timeout, or server error'],  
          ].map(([code, name, desc]) => (  
            <div key={code} className="flex flex-col sm:flex-row items-start gap-3 px-3 py-2.5 border border-zinc-800/40 bg-zinc-950/40">  
              <code className="text-[11px] font-mono text-rose-400 flex-shrink-0 sm:w-8">{code}</code>  
              <code className="text-[11px] font-mono text-zinc-100 flex-shrink-0 sm:w-36">{name}</code>  
              <p className="text-[11px] font-mono text-zinc-300">{desc}</p>  
            </div>  
          ))}  
        </div>  
        <p className="text-[11px] font-mono text-zinc-300 mt-4">  
          All error responses follow the shape: <code className="text-sky-400">{'{ "error": "message" }'}</code>  
        </p>  
      </DocSection>  
    ),  
  };  
  
  return <>{sections[activeSectionId] || sections['authentication']}</>;  
}  
  
function ArchitectureTab({ activeSectionId }) {  
  const sections = {  
    'system-overview': (  
      <DocSection id="system-overview" title="System overview">  
        <ArchDiagram lines={[  
          '┌─────────────────────────────────────────────────────────────┐',  
          '│  Frontend (React + Vite)                                    │',  
          '│  Wagmi · Viem · Zama WASM SDK (browser)                    │',  
          '└───────────────────────┬─────────────────────────────────────┘',  
          '                        │ REST API',  
          '┌───────────────────────▼─────────────────────────────────────┐',  
          '│  Backend (Node.js + Express)                                │',  
          '│  Prisma ORM · PostgreSQL · Viem (Node) · Zama SDK (Node)   │',  
          '│                                                             │',  
          '│  ┌─────────────┐  ┌─────────────┐  ┌────────────────────┐ │',  
          '│  │  Indexer    │  │  Bot        │  │  Webhook Worker    │ │',  
          '│  │  (15s poll) │  │  (Telegram) │  │  (3s poll)         │ │',  
          '│  └──────┬──────┘  └─────────────┘  └────────────────────┘ │',  
          '└─────────┼───────────────────────────────────────────────────┘',  
          '          │ getLogs()',  
          '┌─────────▼───────────────────────────────────────────────────┐',  
          '│  Ethereum Sepolia                                           │',  
          '│  PaymentRouter · DonationVault · ConfidentialUSDC          │',  
          '└─────────────────────────────────────────────────────────────┘',  
          '          │',  
          '┌─────────▼───────────────────────────────────────────────────┐',  
          '│  Zama Coprocessor + Gateway                                 │',  
          '│  FHE proof verification · Decryption authorization         │',  
          '└─────────────────────────────────────────────────────────────┘',  
        ]} />  
      </DocSection>  
    ),  
    'indexer': (  
      <DocSection id="indexer" title="Chain indexer">  
        <p>  
          The indexer is a background service that polls Ethereum Sepolia for  
          contract events every 15 seconds using <code className="text-sky-400 text-[11px]">getLogs()</code>.  
          It processes events in 2,000-block chunks and maintains a cursor per  
          contract so no events are missed across restarts.  
        </p>  
        <SubSection title="What it does">  
          <ul className="space-y-1.5">  
            {[  
              'Fetches SingleInvoiceCreated, MultiInvoiceCreated, InvoicePaid, InvoiceCancelled, InvoiceExpired events from PaymentRouter',  
              'Fetches PageCreated and DonationReceived events from DonationVault',  
              'Writes all events to the Prisma database',  
              'Calls safeNotify to fire Telegram bot notifications',  
              'Calls safeEnqueue to write WebhookDelivery rows for outbound webhooks',  
              'Uses exponential backoff (1s, 2s, 4s) on RPC failures before giving up a chunk',  
              'Safe cursor: only advances past blocks that were successfully read',  
            ].map((s, i) => (  
              <li key={i} className="flex gap-2 text-[11px] font-mono text-zinc-200">  
                <span className="text-sky-400 flex-shrink-0">·</span>{s}  
              </li>  
            ))}  
          </ul>  
        </SubSection>  
      </DocSection>  
    ),  
    'dual-key': (  
      <DocSection id="dual-key" title="Dual-key encryption">  
        <ArchDiagram lines={[  
          '              Burner Private Key (raw)',  
          '                        │',  
          '          ┌─────────────┴─────────────┐',  
          '          │                           │',  
          ' AES-256-GCM with              AES-256-GCM with',  
          ' user password                 server wrapping key',  
          ' (browser, PBKDF2)             (BURNER_WRAPPING_KEY env)',  
          '          │                           │',  
          '          ▼                           ▼',  
          '  encryptedKey_user          encryptedKey_server',  
          '  (stored in DB)              (stored in DB, nullable)',  
          '',  
          '  Used for: manual recovery   Used for: automation signing',  
          '  Deleted by: never           Deleted by: disable-automation',  
        ]} />  
        <p className="mt-4">  
          The server never sees the user password. The browser never sees  
          the server wrapping key. Both blobs encrypt the same underlying  
          private key — they are fully independent.  
        </p>  
      </DocSection>  
    ),  
    'webhook-queue': (  
      <DocSection id="webhook-queue" title="Webhook queue">  
        <ArchDiagram lines={[  
          'Indexer detects on-chain event',  
          '        │',  
          '        ▼',  
          'enqueueWebhook(eventName, wallet, data)',  
          '  resolve burner → main wallet',  
          '  find subscribed WebhookEndpoint rows',  
          '  write WebhookDelivery rows (status = pending)',  
          '        │',  
          '        ▼',  
          'WebhookDelivery table (PostgreSQL — durable queue)',  
          '        │',  
          '        ▼ (polled every 3 seconds)',  
          'webhookWorker.processBatch()',  
          '  SELECT pending WHERE nextAttemptAt <= now',  
          '  HMAC-sign payload',  
          '  HTTP POST to endpoint.url (10s timeout)',  
          '  Update row: status, attempts, nextAttemptAt',  
          '  On success: reset endpoint.failCount',  
          '  On failure: increment failCount, schedule retry',  
          '  At 10 failures: auto-disable endpoint',  
        ]} />  
      </DocSection>  
    ),  
    'security-model': (  
      <DocSection id="security-model" title="Security model">  
        <div className="space-y-3">  
          {[  
            {  
              actor:  'Server',  
              can:    ['Decrypt encryptedKey_server and sign transactions', 'Read burner metadata', 'See the raw private key in memory during /create (immediately discarded)'],  
              cannot: ['Decrypt encryptedKey_user (requires user password)', 'Sign anything after automation is disabled', 'Recover user passwords'],  
            },  
            {  
              actor:  'API key holder',  
              can:    ['Create invoices within configured caps', 'Read key metadata via GET /api/public/me'],  
              cannot: ['Exceed USDC caps', 'Access other users data', 'See or exfiltrate private keys'],  
            },  
            {  
              actor:  'Webhook receiver',  
              can:    ['Receive HMAC-signed event payloads', 'Verify payload authenticity using the signing secret'],  
              cannot: ['Decrypt FHE amounts', 'Trigger actions on Zeroremit', 'Access other endpoints data'],  
            },  
          ].map(item => (  
            <div key={item.actor} className="border border-zinc-800/60 bg-zinc-950/40 overflow-hidden">  
              <div className="px-4 py-2 border-b border-zinc-800/60">  
                <p className="text-[10px] font-bold font-mono text-zinc-100 uppercase tracking-widest">{item.actor}</p>  
              </div>  
              <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-zinc-800/60">  
                <div className="px-4 py-3">  
                  <p className="text-[9px] font-bold font-mono text-emerald-400 uppercase tracking-widest mb-2">Can do</p>  
                  {item.can.map((s, i) => (  
                    <div key={i} className="flex gap-2 text-[11px] font-mono text-zinc-300 mb-1">  
                      <span className="text-emerald-400 flex-shrink-0">✓</span>{s}  
                    </div>  
                  ))}  
                </div>  
                <div className="px-4 py-3">  
                  <p className="text-[9px] font-bold font-mono text-rose-400 uppercase tracking-widest mb-2">Cannot do</p>  
                  {item.cannot.map((s, i) => (  
                    <div key={i} className="flex gap-2 text-[11px] font-mono text-zinc-300 mb-1">  
                      <span className="text-rose-400 flex-shrink-0">✕</span>{s}  
                    </div>  
                  ))}  
                </div>  
              </div>  
            </div>  
          ))}  
        </div>  
      </DocSection>  
    ),  
    'tech-stack': (  
      <DocSection id="tech-stack" title="Tech stack">  
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">  
          {[  
            { layer: 'Frontend',     items: ['React 18 + Vite', 'Tailwind CSS', 'wagmi + viem', 'Zama Relayer SDK (web)', 'React Router v6', 'Reown AppKit (wallet modal)'] },  
            { layer: 'Backend',      items: ['Node.js (ESM)', 'Express 5', 'Prisma ORM + PostgreSQL', 'Viem (Node)', 'Zama Relayer SDK (Node)', 'node-telegram-bot-api'] },  
            { layer: 'Blockchain',   items: ['Ethereum Sepolia', 'Solidity smart contracts', 'Zama fhEVM', 'Zama coprocessor + gateway'] },  
            { layer: 'Integrations', items: ['Telegram Bot API', 'Zapier (Webhooks by Zapier)', 'HMAC-SHA256 webhook signing', 'Burner wallet automation'] },  
          ].map(item => (  
            <div key={item.layer} className="border border-zinc-800/40 bg-zinc-950/40 p-4">  
              <p className="text-[10px] font-bold font-mono text-sky-400 uppercase tracking-widest mb-3">{item.layer}</p>  
              <div className="space-y-1">  
                {item.items.map(s => (  
                  <div key={s} className="flex gap-2 text-[11px] font-mono text-zinc-300">  
                    <span className="text-zinc-500">—</span>{s}  
                  </div>  
                ))}  
              </div>  
            </div>  
          ))}  
        </div>  
      </DocSection>  
    ),  
  };  
  
  return <>{sections[activeSectionId] || sections['system-overview']}</>;  
}  
  
function BackendTab({ activeSectionId }) {  
  const sections = {  
    'backend-overview': (  
      <DocSection id="backend-overview" title="Overview">  
        <p>  
          The Zeroremit backend is a Node.js service built with Express 5 that powers the  
          entire platform. It runs three concurrent systems: a REST API for the React frontend,  
          an on-chain event indexer that polls Ethereum Sepolia, and a Telegram bot for  
          real-time payment notifications and invoice management.  
        </p>  
        <SubSection title="Core responsibilities">  
          <ul className="space-y-1.5">  
            {[  
              'Index on-chain events from PaymentRouter and DonationVault contracts into PostgreSQL',  
              'Serve a REST API for invoice lookups, dashboard data, donation pages, and protocol stats',  
              'Run a Telegram bot for real-time alerts, balance queries, and invoice creation',  
              'Manage burner wallets with dual-key encryption for server-side transaction signing',  
              'Issue scoped API keys with per-invoice and daily USDC caps',  
              'Fire HMAC-signed outbound webhooks on every on-chain event',  
              'Rotate between three RPC providers automatically on failure',  
            ].map((item, i) => (  
              <li key={i} className="flex gap-2.5 items-start text-[11px] font-mono text-zinc-200">  
                <span className="text-sky-400 flex-shrink-0">·</span>  
                {item}  
              </li>  
            ))}  
          </ul>  
        </SubSection>  
        <InfoBox type="info">  
          The backend never sees or stores plaintext payment amounts. Encrypted cUSDC  
          amounts stay on-chain — only metadata (titles, memos, timestamps, addresses)  
          is indexed.  
        </InfoBox>  
      </DocSection>  
    ),  
    'backend-architecture': (  
      <DocSection id="backend-architecture" title="Architecture">  
        <ArchDiagram lines={[  
          '┌─────────────────────────────────────────────────────────────┐',  
          '│         Sepolia (RPC Providers)                             │',  
          '│  Alchemy (primary) · Infura (fallback) · Public (fallback) │',  
          '└─────────────────────────┬───────────────────────────────────┘',  
          '                          │',  
          '             ┌────────────▼────────────┐',  
          '             │     rpcClient.js        │',  
          '             │  withFallback() rotation│',  
          '             │  per-provider health    │',  
          '             │  60s cooldown on fail   │',  
          '             └────────────┬────────────┘',  
          '                          │',  
          '             ┌────────────▼────────────┐',  
          '             │    Indexer (15s poll)   │',  
          '             │  PaymentRouter events   │',  
          '             │  DonationVault events   │',  
          '             └────────────┬────────────┘',  
          '                          │',  
          '             ┌────────────▼────────────┐',  
          '             │  PostgreSQL (Prisma)    │',  
          '             │  invoices, donations,   │',  
          '             │  burner wallets, keys,  │',  
          '             │  webhooks, telegram,    │',  
          '             │  indexer cursors        │',  
          '             └──┬──────────────────┬───┘',  
          '                │                  │',  
          '   ┌────────────▼──────┐  ┌────────▼──────────────┐',  
          '   │  Express REST API │  │    Telegram Bot       │',  
          '   │  /api/invoices    │  │  /balance /invoices   │',  
          '   │  /api/donations   │  │  /create /pay /link   │',  
          '   │  /api/dashboard   │  │  + real-time alerts   │',  
          '   │  /api/burner      │  └───────────────────────┘',  
          '   │  /api/public      │',  
          '   │  /api/webhooks    │',  
          '   └──────────┬────────┘',  
          '              │',  
          '   ┌──────────▼────────┐',  
          '   │  React Frontend   │',  
          '   │  (Vercel)         │',  
          '   └───────────────────┘',  
        ]} />  
        <SubSection title="Event flow">  
          <ArchDiagram lines={[  
            'Wallet creates invoice (frontend → contract)',  
            '            ↓',  
            'Sepolia emits SingleInvoiceCreated event',  
            '            ↓',  
            'Indexer picks up event within ~15 seconds',  
            '            ↓',  
            'Row inserted into PostgreSQL Invoice table',  
            '            ↓',  
            'notifier.js fires Telegram alert (if linked)',  
            'webhookWorker fires HMAC-signed HTTP POST',  
            '            ↓',  
            'Frontend queries /api/invoices for refreshed list',  
          ]} />  
        </SubSection>  
        <SubSection title="Project structure">  
          <ArchDiagram lines={[  
            'backend/src/',  
            '├── api/                    # Express route handlers',  
            '│   ├── invoices.js         # Invoice lookup endpoints',  
            '│   ├── donations.js        # Donation page endpoints',  
            '│   ├── dashboard.js        # Wallet summary',  
            '│   ├── stats.js            # Protocol stats + timeseries',  
            '│   ├── telegram.js         # Telegram link/unlink/prefs',  
            '│   ├── burner.js           # Burner wallet CRUD + API keys',  
            '│   ├── public.js           # Public invoice API (Bearer auth)',  
            '│   └── webhooks.js         # Webhook CRUD + delivery log',  
            '│',  
            '├── bot/                    # Telegram bot',  
            '│   ├── index.js            # Bot init (polling mode)',  
            '│   ├── commands.js         # All /command handlers',  
            '│   └── notifier.js         # Outbound alerts',  
            '│',  
            '├── chain/                  # Blockchain layer',  
            '│   ├── rpcClient.js        # 3-provider fallback + withFallback()',  
            '│   ├── client.js           # Re-exports rpcClient as chainClient',  
            '│   ├── abis.js             # Event ABI definitions',  
            '│   └── indexer.js          # Polling indexer + cursor mgmt',  
            '│',  
            '├── lib/                    # Shared utilities',  
            '│   ├── burnerCrypto.js     # AES-256-GCM encrypt/decrypt',  
            '│   ├── apiKeyAuth.js       # Bearer-token middleware',  
            '│   ├── burnerSigner.js     # Decrypt + sign transactions',  
            '│   ├── zamaEncrypt.js      # Zama SDK wrapper (Node)',  
            '│   ├── webhookQueue.js     # enqueueWebhook()',  
            '│   ├── webhookDispatcher.js# HMAC signing + HTTP POST',  
            '│   └── webhookWorker.js    # Background delivery poller',  
            '│',  
            '├── db/                     # Database layer',  
            '│   ├── schema.prisma       # Prisma models (PostgreSQL)',  
            '│   ├── client.js           # Prisma client singleton',  
            '│   └── migrations/         # Auto-generated migrations',  
            '│',  
            '├── config.js               # Centralized config loader',  
            '└── index.js                # Server entry point',  
          ]} />  
        </SubSection>  
      </DocSection>  
    ),  
    'backend-database': (  
      <DocSection id="backend-database" title="Database (PostgreSQL)">  
        <p>  
          The backend uses <strong className="text-zinc-100">PostgreSQL</strong> with Prisma ORM.  
          In production it runs on Render's managed PostgreSQL service. Locally,  
          a Docker container provides an identical environment.  
        </p>  
        <SubSection title="Why PostgreSQL">  
          <div className="space-y-2">  
            {[  
              ['Persistence',   'Data survives server restarts and redeployments — critical for indexer cursors, burner wallets, and API keys'],  
              ['Render compat', 'Render free tier filesystem is ephemeral — SQLite databases are wiped on every deploy'],  
              ['Concurrency',   'Handles concurrent writes from the indexer, webhook worker, and API without file locking issues'],  
              ['Scalability',   'Can migrate to a larger Render plan or external PostgreSQL host without code changes'],  
            ].map(([title, desc]) => (  
              <div key={title} className="pl-4 border-l-2 border-zinc-800 py-1">  
                <p className="text-[10px] font-bold font-mono text-zinc-100 uppercase tracking-wide mb-1">{title}</p>  
                <p className="text-[11px] font-mono text-zinc-300">{desc}</p>  
              </div>  
            ))}  
          </div>  
        </SubSection>  
        <SubSection title="Local setup with Docker">  
          <ArchDiagram lines={[  
            '# Start PostgreSQL container (first time only)',  
            'docker run --name zeroremit-db \\',  
            '  -e POSTGRES_USER=zeroremit \\',  
            '  -e POSTGRES_PASSWORD=zeroremit123 \\',  
            '  -e POSTGRES_DB=zeroremit \\',  
            '  -p 5432:5432 -d postgres:16',  
            '',  
            '# Daily workflow',  
            'docker start zeroremit-db    # start',  
            'docker stop zeroremit-db     # stop when done',  
            '',  
            '# .env',  
            'DATABASE_URL="postgresql://zeroremit:zeroremit123@localhost:5432/zeroremit"',  
          ]} />  
        </SubSection>  
        <SubSection title="Data models">  
          <div className="space-y-1.5">  
            {[  
              ['Invoice',         'Single and multi-item invoices indexed from PaymentRouter'],  
              ['DonationPage',    'Donation campaigns indexed from DonationVault'],  
              ['Donation',        'Individual donation records (unique by txHash)'],  
              ['TelegramLink',    'Wallet ↔ Telegram chat ID mapping + notification prefs'],  
              ['TelegramCode',    'One-time codes for linking wallets to Telegram'],  
              ['IndexerCursor',   'Last processed block per contract — survives restarts'],  
              ['BurnerWallet',    'Server-side signing key, dual-encrypted, scoped to one user'],  
              ['ApiKey',          'Scoped Bearer tokens with per-invoice and daily USDC caps'],  
              ['WebhookEndpoint', 'User-registered URLs for outbound event callbacks'],  
              ['WebhookDelivery', 'Durable delivery queue — retries across server restarts'],  
            ].map(([model, desc]) => (  
              <div key={model} className="flex flex-col sm:flex-row items-start gap-3 px-3 py-2 border border-zinc-800/40 bg-zinc-950/40">  
                <code className="text-[10px] font-mono text-sky-400 flex-shrink-0 sm:w-36">{model}</code>  
                <p className="text-[11px] font-mono text-zinc-300">{desc}</p>  
              </div>  
            ))}  
          </div>  
        </SubSection>  
        <SubSection title="Migration commands">  
          <ArchDiagram lines={[  
            '# Create new migration (local dev only)',  
            'npm run db:migrate',  
            '',  
            '# Apply existing migrations (production)',  
            'npm run db:deploy',  
            '',  
            '# Regenerate Prisma client',  
            'npm run db:generate',  
            '',  
            '# Open visual database browser',  
            'npm run db:studio',  
          ]} />  
        </SubSection>  
      </DocSection>  
    ),  
    'backend-rpc-fallback': (  
      <DocSection id="backend-rpc-fallback" title="RPC fallback system">  
        <p>  
          The backend connects to Ethereum Sepolia through three RPC providers configured  
          in priority order. If the primary provider fails, requests automatically rotate  
          to the next available provider.  
        </p>  
        <SubSection title="How it works">  
          <ArchDiagram lines={[  
            'RPC call initiated',  
            '        │',  
            '        ▼',  
            'withFallback(client => client.getLogs(...))',  
            '        │',  
            '   ┌────▼────────────────────────────────┐',  
            '   │ Try Alchemy (primary)                │',  
            '   │   ✅ success → return result         │',  
            '   │   ❌ fail → mark failed (1/3)        │',  
            '   ├──────────────────────────────────────┤',  
            '   │ Try Infura (fallback 1)               │',  
            '   │   ✅ success → return result         │',  
            '   │   ❌ fail → mark failed (1/3)        │',  
            '   ├──────────────────────────────────────┤',  
            '   │ Try Public RPC (fallback 2)           │',  
            '   │   ✅ success → return result         │',  
            '   │   ❌ fail → throw error              │',  
            '   └──────────────────────────────────────┘',  
            '',  
            '// After 3 consecutive failures:',  
            '// Provider enters 60s cooldown',  
            '// Automatically recovers when next call succeeds',  
          ]} />  
        </SubSection>  
        <SubSection title="Provider health states">  
          <div className="space-y-1.5">  
            {[  
              ['Available',   'Provider is healthy — tried first based on priority order'],  
              ['Degraded',    '1–2 consecutive failures — still tried but lower priority'],  
              ['Cooling',     '3+ failures — skipped for 60 seconds, then retried'],  
              ['Recovered',   'A previously cooling provider succeeds — reset to healthy'],  
            ].map(([state, desc]) => (  
              <div key={state} className="flex flex-col sm:flex-row items-start gap-3 px-3 py-2 border border-zinc-800/40 bg-zinc-950/40">  
                <code className="text-[10px] font-mono text-sky-400 flex-shrink-0 sm:w-24">{state}</code>  
                <p className="text-[11px] font-mono text-zinc-300">{desc}</p>  
              </div>  
            ))}  
          </div>  
        </SubSection>  
        <SubSection title="Two export modes">  
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">  
            <div className="p-4 border border-zinc-800/40 bg-zinc-950/40">  
              <p className="text-[10px] font-bold font-mono text-sky-400 uppercase tracking-widest mb-2">withFallback()</p>  
              <p className="text-[11px] font-mono text-zinc-300">  
                Used by the indexer for getLogs, getBlock, getBlockNumber.  
                Per-provider health tracking with detailed logging.  
              </p>  
            </div>  
            <div className="p-4 border border-zinc-800/40 bg-zinc-950/40">  
              <p className="text-[10px] font-bold font-mono text-amber-400 uppercase tracking-widest mb-2">rpcClient</p>  
              <p className="text-[11px] font-mono text-zinc-300">  
                Used by the Telegram bot for balance reads and contract queries.  
                Uses viem's built-in fallback transport.  
              </p>  
            </div>  
          </div>  
        </SubSection>  
        <InfoBox type="info">  
          API keys are automatically masked in startup logs. You will see URLs like  
          <code className="text-sky-400 ml-1">https://eth-sepolia.g.alchemy.com/v2/***</code>  
        </InfoBox>  
      </DocSection>  
    ),  
    'backend-indexer': (  
      <DocSection id="backend-indexer" title="Chain indexer">  
        <p>  
          The indexer is a background service that polls Ethereum Sepolia for contract  
          events every 15 seconds. It processes events in 2,000-block chunks and writes  
          them to PostgreSQL.  
        </p>  
        <SubSection title="Configuration">  
          <div className="space-y-1.5">  
            {[  
              ['CHUNK_SIZE',     '2,000 blocks',  'Blocks per getLogs request'],  
              ['POLL_INTERVAL',  '15 seconds',    'Time between polling cycles'],  
              ['INTER_CHUNK_MS', '300ms',          'Pause between chunks to respect rate limits'],  
              ['MAX_RETRIES',    '3 attempts',     'Retry count per chunk before giving up'],  
            ].map(([param, value, desc]) => (  
              <div key={param} className="flex flex-col sm:flex-row items-start gap-3 px-3 py-2 border border-zinc-800/40 bg-zinc-950/40">  
                <code className="text-[10px] font-mono text-sky-400 flex-shrink-0 sm:w-32">{param}</code>  
                <span className="text-[10px] font-mono text-zinc-100 flex-shrink-0 sm:w-24">{value}</span>  
                <p className="text-[11px] font-mono text-zinc-300">{desc}</p>  
              </div>  
            ))}  
          </div>  
        </SubSection>  
        <SubSection title="Events tracked">  
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">  
            <div className="p-3 border border-zinc-800/40 bg-zinc-950/40">  
              <p className="text-[10px] font-bold font-mono text-sky-400 uppercase tracking-widest mb-2">PaymentRouter</p>  
              {['SingleInvoiceCreated', 'MultiInvoiceCreated', 'InvoicePaid', 'InvoiceItemPaid', 'InvoiceCancelled', 'InvoiceExpired'].map(e => (  
                <div key={e} className="flex gap-2 text-[11px] font-mono text-zinc-300 mb-0.5">  
                  <span className="text-zinc-500">·</span>{e}  
                </div>  
              ))}  
            </div>  
            <div className="p-3 border border-zinc-800/40 bg-zinc-950/40">  
              <p className="text-[10px] font-bold font-mono text-emerald-400 uppercase tracking-widest mb-2">DonationVault</p>  
              {['PageCreated', 'DonationReceived'].map(e => (  
                <div key={e} className="flex gap-2 text-[11px] font-mono text-zinc-300 mb-0.5">  
                  <span className="text-zinc-500">·</span>{e}  
                </div>  
              ))}  
            </div>  
          </div>  
        </SubSection>  
        <SubSection title="Resilience">  
          <ul className="space-y-1.5">  
            {[  
              'Each chunk retries with exponential backoff (1s, 2s, 4s) before failing',  
              'Failed chunks stop the cursor — events are never skipped silently',  
              'RPC rotation via withFallback() is transparent to the indexer logic',  
              'Block timestamps are cached per tick to minimize RPC calls',  
              'The safe cursor only advances past blocks that were fully read',  
              'Cursor survives restarts — stored in PostgreSQL IndexerCursor table',  
            ].map((s, i) => (  
              <li key={i} className="flex gap-2 text-[11px] font-mono text-zinc-200">  
                <span className="text-sky-400 flex-shrink-0">·</span>{s}  
              </li>  
            ))}  
          </ul>  
        </SubSection>  
      </DocSection>  
    ),  
    'backend-bot': (  
      <DocSection id="backend-bot" title="Telegram bot">  
        <p>  
          The Telegram bot runs in polling mode — no public webhook URL required.  
          It delivers real-time payment notifications and provides a full command  
          interface for managing invoices, balances, and automation.  
        </p>  
        <SubSection title="Balance command">  
          <p>  
            The <code className="text-sky-400 text-[11px]">/balance</code> command displays  
            ETH and USDC balances for both the main wallet and burner wallet (if configured).  
            cUSDC balances are shown as <code className="text-zinc-200 text-[11px]">[encrypted]</code> since  
            they cannot be decrypted outside the browser.  
          </p>  
          <ArchDiagram lines={[  
            'Balances',  
            '',  
            'Main Wallet',  
            'Address: 0x1234…5678',  
            'ETH:     0.2341 ETH',  
            'USDC:    150.00 USDC',  
            'cUSDC:   [encrypted]',  
            '',  
            'Burner Wallet (✅ automation on)',  
            'Address: 0xAbcd…EfGh',  
            'ETH:     0.0082 ETH',  
            'USDC:    0.00 USDC',  
            'cUSDC:   [encrypted]',  
            '',  
            '⚠️ Low burner ETH — shown if < 0.005 ETH',  
          ]} />  
        </SubSection>  
        <SubSection title="Notification events">  
          <div className="space-y-1.5">  
            {[  
              ['invoicePaid',       'Invoice the user created is paid'],  
              ['invoiceReceived',   'User is the named recipient on a new invoice'],  
              ['invoiceCancelled',  'Invoice involving the user is cancelled'],  
              ['invoiceExpired',    'User invoice passes dueAt unpaid'],  
              ['donationReceived',  'New donation on user page'],  
            ].map(([key, desc]) => (  
              <div key={key} className="flex flex-col sm:flex-row items-start gap-3 px-3 py-2 border border-zinc-800/40 bg-zinc-950/40">  
                <code className="text-[10px] font-mono text-sky-400 flex-shrink-0 sm:w-36">{key}</code>  
                <p className="text-[11px] font-mono text-zinc-300">{desc}</p>  
              </div>  
            ))}  
          </div>  
        </SubSection>  
        <SubSection title="Invoice creation flow">  
          <ArchDiagram lines={[  
            'User sends: /create 50.00 0xRecipient Design work',  
            '        │',  
            '        ▼',  
            'commands.js — /create handler',  
            '  checkAutomationReadiness()',  
            '  verify: burner exists, automation on, API key registered',  
            '        │',  
            '        ▼',  
            'POST /api/public/invoices',  
            'Authorization: Bearer <stored API key>',  
            '        │',  
            '        ▼',  
            'Burner wallet signs on-chain transaction',  
            'FHE-encrypts amount server-side',  
            '        │',  
            '        ▼',  
            'Bot replies with payUrl + txHash',  
          ]} />  
        </SubSection>  
      </DocSection>  
    ),  
    'backend-webhooks': (  
      <DocSection id="backend-webhooks" title="Webhook delivery">  
        <p>  
          The webhook delivery system uses PostgreSQL as a durable queue.  
          Deliveries survive server restarts and are retried automatically  
          with exponential backoff.  
        </p>  
        <SubSection title="Delivery pipeline">  
          <ArchDiagram lines={[  
            'On-chain event detected by indexer',  
            '        │',  
            '        ▼',  
            'enqueueWebhook(eventName, wallet, data)',  
            '  resolve burner address → main wallet',  
            '  find subscribed WebhookEndpoint rows',  
            '  write WebhookDelivery rows (status = pending)',  
            '        │',  
            '        ▼',  
            'PostgreSQL WebhookDelivery table',  
            '  (durable queue — survives restarts)',  
            '        │',  
            '        ▼  polled every 3 seconds',  
            'webhookWorker.processBatch()',  
            '  SELECT pending WHERE nextAttemptAt <= now',  
            '  HMAC-sign payload with endpoint secret',  
            '  HTTP POST to endpoint URL (10s timeout)',  
            '  On success: mark delivered, reset failCount',  
            '  On failure: increment attempts, schedule retry',  
            '  At 10 consecutive failures: auto-disable endpoint',  
          ]} />  
        </SubSection>  
        <SubSection title="Signature headers">  
          <div className="space-y-1.5">  
            {[  
              ['X-Zeroremit-Signature', 'sha256=<hex HMAC>'],  
              ['X-Zeroremit-Timestamp', 'Unix seconds'],  
              ['X-Zeroremit-Event',     'e.g. invoice.paid'],  
              ['Content-Type',          'application/json'],  
            ].map(([header, value]) => (  
              <div key={header} className="flex flex-col sm:flex-row items-start gap-3 px-3 py-2 border border-zinc-800/40 bg-zinc-950/40">  
                <code className="text-[10px] font-mono text-sky-400 flex-shrink-0 sm:w-48">{header}</code>  
                <code className="text-[10px] font-mono text-zinc-200">{value}</code>  
              </div>  
            ))}  
          </div>  
        </SubSection>  
        <SubSection title="Retry schedule">  
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">  
            {[  
              ['1', 'Immediate'], ['2', '30s'], ['3', '2m'], ['4', '10m'], ['5', '30m'],  
              ['6', '1h'], ['7', '3h'], ['8', '6h'], ['9', '12h'], ['10', '24h'],  
            ].map(([attempt, delay]) => (  
              <div key={attempt} className="px-3 py-2 border border-zinc-800/40 bg-zinc-950/40 text-center">  
                <p className="text-[10px] font-bold font-mono text-zinc-100">#{attempt}</p>  
                <p className="text-[10px] font-mono text-zinc-400">{delay}</p>  
              </div>  
            ))}  
          </div>  
        </SubSection>  
      </DocSection>  
    ),  
    'backend-automation': (  
      <DocSection id="backend-automation" title="Automation layer">  
        <p>  
          The automation stack lets external systems (Telegram bot, Zapier, custom scripts)  
          create invoices on behalf of a user without requiring MetaMask interaction.  
        </p>  
        <SubSection title="Four layers">  
          <div className="space-y-3">  
            {[  
              {  
                layer: 'Layer 1 — Burner Wallet',  
                desc: 'Server-side signing key, dual-encrypted with AES-256-GCM. User password encrypts client-side copy, BURNER_WRAPPING_KEY encrypts server-side copy.',  
                color: 'text-sky-400',  
              },  
              {  
                layer: 'Layer 2 — API Keys',  
                desc: 'Scoped Bearer tokens with per-invoice ($500 default) and daily ($2,000 default) USDC caps. SHA-256 hashed before storage.',  
                color: 'text-emerald-400',  
              },  
              {  
                layer: 'Layer 3 — Public Invoice API',  
                desc: 'POST /api/public/invoices — authenticated by API key. Burner wallet signs and broadcasts the on-chain transaction. FHE encryption happens server-side.',  
                color: 'text-violet-400',  
              },  
              {  
                layer: 'Layer 4 — Outbound Webhooks',  
                desc: 'HMAC-signed HTTP callbacks fired on every on-chain event. PostgreSQL-backed durable queue with automatic retries.',  
                color: 'text-amber-400',  
              },  
            ].map(item => (  
              <div key={item.layer} className="p-4 border border-zinc-800/40 bg-zinc-950/40">  
                <p className={`text-[10px] font-bold font-mono uppercase tracking-widest mb-2 ${item.color}`}>  
                  {item.layer}  
                </p>  
                <p className="text-[11px] font-mono text-zinc-300">{item.desc}</p>  
              </div>  
            ))}  
          </div>  
        </SubSection>  
        <SubSection title="Integration map">  
          <ArchDiagram lines={[  
            'Telegram Bot ── /create command ──► Layer 3 (API key auth)',  
            '                /invoices, /pay ──► Prisma DB + on-chain reads',  
            '                notifications ────► Indexer events (notifier)',  
            '',  
            'Zapier ──────── Catch Hook ────────► Layer 4 (webhook delivery)',  
            '                POST action ───────► Layer 3 (API key auth)',  
            '',  
            'Slack / Discord via Zapier ────────► Layer 4 (webhook delivery)',  
            'Facebook Leads  via Zapier ────────► Layer 3 (API key auth)',  
          ]} />  
        </SubSection>  
      </DocSection>  
    ),  
    'backend-deployment': (  
      <DocSection id="backend-deployment" title="Deployment (Render)">  
        <p>  
          The backend deploys to <strong className="text-zinc-100">Render</strong> with a  
          managed PostgreSQL database. Both services run in the same region for  
          internal network communication.  
        </p>  
        <SubSection title="Setup steps">  
          <div className="space-y-2">  
            {[  
              ['01', 'Create PostgreSQL', 'Render Dashboard → New → PostgreSQL → Free tier, same region as web service'],  
              ['02', 'Copy Internal URL', 'Copy the Internal Database URL from the PostgreSQL dashboard'],  
              ['03', 'Create Web Service', 'Render Dashboard → New → Web Service → Connect private GitHub repo'],  
              ['04', 'Build command',     'npm install && npm run db:generate && npm run db:deploy'],  
              ['05', 'Start command',     'npm start'],  
              ['06', 'Set env vars',      'Add all environment variables in the Render Environment tab'],  
              ['07', 'Deploy',            'Push to GitHub — Render auto-deploys and runs migrations'],  
            ].map(([step, title, desc]) => (  
              <div key={step} className="flex gap-4 items-start px-4 py-3 border border-zinc-800/40 bg-zinc-950/40">  
                <span className="text-[10px] font-bold font-mono text-sky-400 flex-shrink-0">{step}</span>  
                <div>  
                  <p className="text-[10px] font-bold font-mono text-zinc-100 uppercase tracking-wide mb-0.5">{title}</p>  
                  <p className="text-[11px] font-mono text-zinc-300">{desc}</p>  
                </div>  
              </div>  
            ))}  
          </div>  
        </SubSection>  
        <SubSection title="Free tier limitations">  
          <div className="space-y-1.5">  
            {[  
              ['Sleep after inactivity', 'Free web services sleep after 15 minutes — first request takes ~30s to wake up'],  
              ['PostgreSQL expiry',      'Free databases expire after 90 days — Render emails a warning before this happens'],  
              ['Ephemeral filesystem',   'Files written to disk are lost on redeploy — this is why PostgreSQL is required'],  
              ['Build minutes',          '500 free build minutes per month'],  
            ].map(([limit, desc]) => (  
              <div key={limit} className="flex flex-col sm:flex-row items-start gap-3 px-3 py-2 border border-zinc-800/40 bg-zinc-950/40">  
                <code className="text-[10px] font-mono text-amber-400 flex-shrink-0 sm:w-40">{limit}</code>  
                <p className="text-[11px] font-mono text-zinc-300">{desc}</p>  
              </div>  
            ))}  
          </div>  
        </SubSection>  
        <InfoBox type="info">  
          Use UptimeRobot (free) to ping /api/health every 10 minutes to prevent  
          the free tier service from sleeping.  
        </InfoBox>  
      </DocSection>  
    ),  
    'backend-env': (  
      <DocSection id="backend-env" title="Environment variables">  
        <p>  
          All secrets are stored as environment variables — never committed to Git.  
          In production, set these in the Render Dashboard under Environment.  
        </p>  
        <div className="space-y-1.5">  
          {[  
            ['PORT',               '3001 (dev) / 10000 (Render)', 'Server port'],  
            ['NODE_ENV',           'development / production',     'Runtime environment'],  
            ['FRONTEND_URL',       'https://zeroremit.vercel.app', 'Frontend origin for CORS and bot links'],  
            ['BACKEND_URL',        "https://your-app.onrender.com', 'Used", 'by Telegram bot to call its own API'],  
            ['DATABASE_URL',       'postgresql://...',              'PostgreSQL connection string (Internal URL on Render)'],  
            ['RPC_PRIMARY',        'Alchemy Sepolia URL',          'Primary RPC provider'],  
            ['RPC_FALLBACK_1',     'Infura Sepolia URL',           'First fallback RPC'],  
            ['RPC_FALLBACK_2',     'https://rpc.sepolia.org',      'Public fallback RPC'],  
            ['ENABLE_BOT',         'true / false',                 'Toggle Telegram bot'],  
            ['BOT_TOKEN',          'Telegram bot token',           'From @BotFather'],  
            ['BOT_USERNAME',       'zeroremitbot',                 'Bot username for links'],  
            ['BURNER_WRAPPING_KEY','Base64 32-byte key',           'Server-side AES key for burner encryption'],  
          ].map(([name, example, desc]) => (  
            <div key={name} className="flex flex-col sm:flex-row items-start gap-3 px-3 py-2.5 border border-zinc-800/40 bg-zinc-950/40">  
              <code className="text-[10px] font-mono text-sky-400 flex-shrink-0 sm:w-40 break-all">{name}</code>  
              <code className="text-[10px] font-mono text-zinc-300 flex-shrink-0 sm:w-52 break-all">{example}</code>  
              <p className="text-[11px] font-mono text-zinc-200">{desc}</p>  
            </div>  
          ))}  
        </div>  
        <InfoBox type="warning">  
          BURNER_WRAPPING_KEY must be generated once and never rotated. Rotating it  
          invalidates all existing encryptedKey_server blobs — every user would need  
          to re-enable automation.  
        </InfoBox>  
      </DocSection>  
    ),  
  };  
  
  return <>{sections[activeSectionId] || sections['backend-overview']}</>;  
}  
  
// ── Tab content map ───────────────────────────────────────────────────────────  
// Now each tab component receives activeSectionId and renders only that section  
const TAB_CONTENT_MAP = {  
  overview:     (sectionId) => <OverviewTab activeSectionId={sectionId} />,  
  contracts:    (sectionId) => <ContractsTab activeSectionId={sectionId} />,  
  backend:      (sectionId) => <BackendTab activeSectionId={sectionId} />,  
  zama:         (sectionId) => <ZamaTab activeSectionId={sectionId} />,  
  integrations: (sectionId) => <IntegrationsTab activeSectionId={sectionId} />,  
  api:          (sectionId) => <ApiTab activeSectionId={sectionId} />,  
  architecture: (sectionId) => <ArchitectureTab activeSectionId={sectionId} />,  
};  
  
// ═════════════════════════════════════════════════════════════════════════════  
export default function Docs() {  
  const [activeTab,     setActiveTab]     = useState('overview');  
  const [activeSection, setActiveSection] = useState('what-is-zeroremit');  
  const [sidebarOpen,   setSidebarOpen]   = useState(false);  
  const contentRef = useRef(null);  
  
  const currentTab = TABS.find(t => t.id === activeTab);  
  
  // When activeSection changes, scroll the content area back to top  
  // since we're now rendering only one section at a time  
  
   const handleSectionChange = (id) => {  
    setActiveSection(id);  
    setSidebarOpen(false);  
      
    // Instead of attaching to top, scroll with an offset  
    // This prevents the heading from going under the navbar  
    const offset = 160; // Adjust this value based on your navbar + tabbar height  
    const bodyRect = document.body.getBoundingClientRect().top;  
    const element = contentRef.current;  
    if (element) {  
        const elementRect = element.getBoundingClientRect().top;  
        const elementPosition = elementRect - bodyRect;  
        const offsetPosition = elementPosition - offset;  
  
        window.scrollTo({  
            top: offsetPosition,  
            behavior: 'smooth'  
        });  
    }  
  };  
  
  const handleTabChange = (tabId) => {  
    const tab = TABS.find(t => t.id === tabId);  
    setActiveTab(tabId);  
    setActiveSection(tab?.sections[0]?.id || '');  
    setSidebarOpen(false);  
  
    // Scroll to the top of the content area, not the absolute top of the website  
    const offset = 160;  
    const element = contentRef.current;  
    if (element) {  
        const elementPosition = element.getBoundingClientRect().top + window.pageYOffset;  
        window.scrollTo({  
            top: elementPosition - offset,  
            behavior: 'smooth'  
        });  
    }  
  };  
  
  return (  
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-mono tracking-wider selection:bg-sky-400 selection:text-zinc-950">  
  
      {/* ── Background glow ── */}  
      <div className="fixed inset-0 pointer-events-none z-0">  
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-sky-500/[0.03] blur-[140px] rounded-full" />  
      </div>  
  
      <div className="relative z-10">  
  
        {/* ── HERO ── */}  
        <section className="relative pt-36 pb-20 px-4 border-b border-zinc-900/60 text-center overflow-hidden">  
          <div className="absolute inset-0 opacity-[0.025] pointer-events-none bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:24px_24px]" />  
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-sky-500/30 to-transparent" />  
  
          <div className="max-w-4xl mx-auto relative z-10">  
            <p className="text-[10px] font-bold tracking-widest text-sky-400 uppercase font-mono mb-6">  
              // Documentation  
            </p>  
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tighter uppercase mb-4 bg-gradient-to-r from-zinc-200 via-white to-sky-400 bg-clip-text text-transparent">  
              Zeroremit Docs  
            </h1>  
            <p className="text-sm text-zinc-200 max-w-2xl mx-auto leading-relaxed font-sans normal-case mb-8">  
              Everything you need to build with Zeroremit; from smart contract  
              interfaces and FHE encryption flows to REST API endpoints, webhook  
              payloads, and integration patterns for Telegram, Zapier, Slack, and  
              Discord.  
            </p>  
  
            <div className="flex flex-wrap items-center justify-center gap-2">  
              {[  
                { label: '7 sections', color: 'text-sky-400 border-sky-500/20 bg-sky-500/5' },  
                { label: 'REST API',   color: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5' },  
                { label: 'Sepolia',    color: 'text-violet-400 border-violet-500/20 bg-violet-500/5' },  
                { label: 'Zama FHE',   color: 'text-amber-400 border-amber-500/20 bg-amber-500/5' },  
              ].map(b => (  
                <span key={b.label}  
                  className={`text-[10px] font-bold font-mono px-3 py-1 border uppercase tracking-widest ${b.color}`}>  
                  {b.label}  
                </span>  
              ))}  
            </div>  
          </div>  
        </section>  
  
        {/* ── Sticky tab bar ── */}  
        <div className="sticky top-0 z-30 border-b border-zinc-900/60 bg-zinc-950/95 backdrop-blur-md">  
          <div className="max-w-7xl mx-auto">  
            <div className="flex items-center gap-0 overflow-x-auto px-4 sm:px-6 scrollbar-hide">  
              {TABS.map(tab => (  
                <button  
                  key={tab.id}  
                  onClick={() => handleTabChange(tab.id)}  
                  className={`flex-shrink-0 px-4 py-3 text-[10px] font-bold font-mono uppercase tracking-widest border-b-2 transition-all ${
                    activeTab === tab.id
                      ? 'border-sky-500 text-sky-400'
                      : 'border-transparent text-zinc-400 hover:text-zinc-200'
                  }`}>  
                  {tab.label}  
                </button>  
              ))}  
              <button  
                onClick={() => setSidebarOpen(o => !o)}  
                className="ml-auto lg:hidden flex items-center gap-2 text-[10px] font-mono text-zinc-300 hover:text-zinc-100 uppercase tracking-widest px-3">  
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">  
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7"/>  
                </svg>  
                Sections  
              </button>  
            </div>  
          </div>  
        </div>  
  
        {/* ── Body ── */}  
        <div className="flex max-w-7xl mx-auto">  
  
          {/* ── Sidebar ── */}  
          <aside className={  
            `fixed lg:sticky top-14 z-20 lg:z-auto
            w-64 flex-shrink-0 h-[calc(100vh-3.5rem)] overflow-y-auto
            bg-zinc-950 lg:bg-transparent border-r border-zinc-900/60
            transition-transform duration-200
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
            `  
          }>  
            <div className="p-4 space-y-1">  
              <p className="text-[9px] font-bold font-mono text-zinc-500 uppercase tracking-widest px-2 py-1 mb-2">  
                {currentTab?.label}  
              </p>  
              {currentTab?.sections.map(section => (  
                <button  
                  key={section.id}  
                  onClick={() => handleSectionChange(section.id)}  
                  className={`w-full text-left px-3 py-2 text-[11px] font-mono transition-all ${
                    activeSection === section.id
                      ? 'text-sky-400 bg-sky-950/30 border-l-2 border-sky-500 pl-2.5'
                      : 'text-zinc-300 hover:text-zinc-100 hover:bg-zinc-900/20 border-l-2 border-transparent pl-2.5'
                  }`}>  
                  {section.label}  
                </button>  
              ))}  
            </div>  
          </aside>  
  
          {/* Mobile sidebar backdrop */}  
          {sidebarOpen && (  
            <div  
              className="fixed inset-0 z-10 bg-zinc-950/60 lg:hidden"  
              onClick={() => setSidebarOpen(false)}  
            />  
          )}  
  
          {/* ── Main content ── */}  
          <main ref={contentRef} className="flex-1 min-w-0 px-6 sm:px-10 py-10 lg:pl-10 lg:pr-16">  
            {TAB_CONTENT_MAP[activeTab]?.(activeSection)}  
          </main>  
  
          {/* ── Right gutter (on-page nav) ── */}  
          <div className="hidden xl:block w-48 flex-shrink-0 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto p-6">  
            <p className="text-[9px] font-bold font-mono text-zinc-500 uppercase tracking-widest mb-3">  
              On this page  
            </p>  
            {currentTab?.sections.map(section => (  
              <button  
                key={section.id}  
                onClick={() => handleSectionChange(section.id)}  
                className={`block w-full text-left text-[10px] font-mono py-1 transition-colors ${
                  activeSection === section.id
                    ? 'text-sky-400'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}>  
                {section.label}  
              </button>  
            ))}  
          </div>  
        </div>  
      </div>  
    </div>  
  );  
}
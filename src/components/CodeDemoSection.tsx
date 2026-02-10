import { useEffect, useMemo, useRef } from "react";

type CodeToken = { text: string; cls?: string } | { action: "showDropdown" };

type StreamItem =
  | { ch: string; cls: string }
  | { action: "showDropdown" };

const CPS = 25;

export const CodeDemoSection = () => {
  const codeRef = useRef<HTMLElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const timeoutsRef = useRef<number[]>([]);
  const startedRef = useRef(false);
  const playingRef = useRef(false);
  const indexRef = useRef(0);
  const lastTimeRef = useRef(0);

  const codeLines: CodeToken[][] = useMemo(
    () => [
      [
        { text: "nubra" },
        { text: " " },
        { text: "=" },
        { text: " " },
        { text: "InitNubraSdk", cls: "nc-yellow" },
        { text: "(", cls: "nc-yellow" },
        { text: "NubraEnv" },
        { text: "." },
        { text: "UAT", cls: "nc-purple" },
        { text: ")", cls: "nc-yellow" },
      ],
      [
        { text: "instruments" },
        { text: " " },
        { text: "=" },
        { text: " " },
        { text: "InstrumentData", cls: "nc-yellow" },
        { text: "(", cls: "nc-yellow" },
        { text: "nubra" },
        { text: ")", cls: "nc-yellow" },
      ],
      [
        { text: "trade" },
        { text: " " },
        { text: "=" },
        { text: " " },
        { text: "NubraTrader", cls: "nc-yellow" },
        { text: "(", cls: "nc-yellow" },
        { text: "nubra" },
        { text: ", " },
        { text: "version", cls: "nc-yellow" },
        { text: "=", cls: "nc-yellow" },
        { text: "\"V2\"", cls: "nc-purple" },
        { text: ")", cls: "nc-yellow" },
      ],
      [{ text: "" }],
      [
        { text: "REF_ID" },
        { text: " " },
        { text: "=" },
        { text: " " },
        { text: "instruments" },
        { text: "." },
        { text: "get_instrument_by_symbol", cls: "nc-yellow" },
        { text: "(", cls: "nc-yellow" },
        { text: "'RELIANCE'", cls: "nc-purple" },
        { text: ", " },
        { text: "exchange", cls: "nc-yellow" },
        { text: "=", cls: "nc-yellow" },
        { text: "\"NSE\"", cls: "nc-purple" },
        { text: ")", cls: "nc-yellow" },
        { text: "." },
        { text: "ref_id" },
      ],
      [{ text: "" }],
      [
        { text: "result" },
        { text: " " },
        { text: "=" },
        { text: " " },
        { text: "trade" },
        { text: "." },
        { action: "showDropdown" },
        { text: "create_order", cls: "nc-yellow" },
        { text: "(", cls: "nc-yellow" },
        { text: "{" },
      ],
      [
        { text: "    " },
        { text: "\"ref_id\"", cls: "nc-purple" },
        { text: ": " },
        { text: "REF_ID" },
        { text: "," },
      ],
      [
        { text: "    " },
        { text: "\"order_side\"", cls: "nc-purple" },
        { text: ": " },
        { text: "\"ORDER_SIDE_BUY\"", cls: "nc-orange" },
        { text: "," },
      ],
      [
        { text: "    " },
        { text: "\"order_type\"", cls: "nc-purple" },
        { text: ": " },
        { text: "\"ORDER_TYPE_REGULAR\"", cls: "nc-orange" },
        { text: "," },
      ],
      [
        { text: "    " },
        { text: "\"price_type\"", cls: "nc-purple" },
        { text: ": " },
        { text: "\"MARKET\"", cls: "nc-orange" },
        { text: "," },
      ],
      [
        { text: "    " },
        { text: "\"order_qty\"", cls: "nc-purple" },
        { text: ": " },
        { text: "1000", cls: "nc-darkgreen" },
        { text: "," },
      ],
      [
        { text: "    " },
        { text: "\"validity_type\"", cls: "nc-purple" },
        { text: ": " },
        { text: "\"IOC\"", cls: "nc-orange" },
        { text: "," },
      ],
      [
        { text: "    " },
        { text: "\"order_delivery_type\"", cls: "nc-purple" },
        { text: ": " },
        { text: "\"ORDER_DELIVERY_TYPE_CNC\"", cls: "nc-orange" },
        { text: "," },
      ],
      [
        { text: "    " },
        { text: "\"exchange\"", cls: "nc-purple" },
        { text: ": " },
        { text: "\"NSE\"", cls: "nc-orange" },
        { text: "," },
      ],
      [
        { text: "    " },
        { text: "\"tag\"", cls: "nc-purple" },
        { text: ": " },
        { text: "\"Crossover_Strategy\"", cls: "nc-orange" },
      ],
      [
        { text: "}" },
        { text: ")" },
      ],
    ],
    []
  );

  const streamRef = useRef<StreamItem[]>([]);

  useEffect(() => {
    const codeEl = codeRef.current;
    const dropdownEl = dropdownRef.current;
    if (!codeEl || !dropdownEl) return;

    const dropdownItems = Array.from(
      dropdownEl.querySelectorAll<HTMLDivElement>(".nc-dropdown__item")
    );

    const buildStream = (lines: CodeToken[][]) => {
      const stream: StreamItem[] = [];
      for (let li = 0; li < lines.length; li += 1) {
        const tokens = lines[li];
        for (const token of tokens) {
          if ("action" in token) {
            stream.push({ action: token.action });
          } else {
            for (const ch of token.text) {
              stream.push({ ch, cls: token.cls || "" });
            }
          }
        }
        if (li !== lines.length - 1) {
          stream.push({ ch: "\n", cls: "" });
        }
      }
      return stream;
    };

    streamRef.current = buildStream(codeLines);

    const clearTimeouts = () => {
      timeoutsRef.current.forEach((id) => window.clearTimeout(id));
      timeoutsRef.current = [];
    };

    const setTimeoutSafe = (fn: () => void, ms: number) => {
      const id = window.setTimeout(fn, ms);
      timeoutsRef.current.push(id);
    };

    const renderCaret = () => {
      const oldCaret = codeEl.querySelector(".nc-caret--active");
      if (oldCaret) oldCaret.classList.remove("nc-caret--active");

      if (!codeEl.firstChild) {
        const caret = document.createElement("span");
        caret.className = "nc-caret nc-caret--active";
        codeEl.appendChild(caret);
        return;
      }

      const caret = codeEl.lastChild;
      if (caret && caret instanceof HTMLElement && caret.classList.contains("nc-caret")) {
        caret.classList.add("nc-caret--active");
      }
    };

    const appendChar = (item: { ch: string; cls: string }) => {
      const caret = codeEl.lastChild;
      if (caret && caret instanceof HTMLElement && caret.classList.contains("nc-caret")) {
        caret.classList.remove("nc-caret--active");
        caret.classList.add("nc-caret--inactive");
      }

      const span = document.createElement("span");
      if (item.cls) span.className = item.cls;
      span.textContent = item.ch;
      codeEl.appendChild(span);

      const newCaret = document.createElement("span");
      newCaret.className = "nc-caret nc-caret--active";
      codeEl.appendChild(newCaret);

      const pre = codeEl.closest("pre");
      if (pre) pre.scrollTop = pre.scrollHeight;
    };

    const showDropdown = () => {
      dropdownEl.classList.remove("nc-dropdown--hidden");
    };

    const hideDropdown = () => {
      dropdownEl.classList.add("nc-dropdown--hidden");
      dropdownItems.forEach((item) => {
        item.classList.remove("nc-dropdown__item--selected", "nc-dropdown__item--click");
      });
    };

    const dropdownStepMs = () => {
      const rate = CPS * 0.4;
      return 1000 / Math.max(rate, 1);
    };

    const animateDropdownSequence = () => {
      showDropdown();
      let idx = 0;
      const targetIndex = dropdownItems.length - 1;

      const step = () => {
        dropdownItems.forEach((item) =>
          item.classList.remove("nc-dropdown__item--selected")
        );
        const current = dropdownItems[idx];
        if (current) current.classList.add("nc-dropdown__item--selected");

        if (idx < targetIndex) {
          idx += 1;
          setTimeoutSafe(step, dropdownStepMs());
          return;
        }

        const selected = dropdownItems[targetIndex];
        if (selected) {
          selected.classList.add("nc-dropdown__item--click");
          setTimeoutSafe(() => {
            selected.classList.remove("nc-dropdown__item--click");
            hideDropdown();
            playingRef.current = true;
            lastTimeRef.current = 0;
            rafRef.current = requestAnimationFrame(tick);
          }, Math.max(320, dropdownStepMs() * 2.2));
        }
      };

      setTimeoutSafe(step, Math.max(180, dropdownStepMs() * 1.1));
    };

    const handleAction = (item: StreamItem) => {
      if ("action" in item && item.action === "showDropdown") {
        playingRef.current = false;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        animateDropdownSequence();
        return true;
      }
      return false;
    };

    const tick = (t: number) => {
      if (!playingRef.current) return;

      if (!lastTimeRef.current) lastTimeRef.current = t;
      const dt = (t - lastTimeRef.current) / 1000;
      const charsToAdd = Math.floor(dt * CPS);

      if (charsToAdd > 0) {
        lastTimeRef.current = t;
        for (let k = 0; k < charsToAdd; k += 1) {
          if (indexRef.current >= streamRef.current.length) {
            playingRef.current = false;
            renderCaret();
            return;
          }
          const item = streamRef.current[indexRef.current];
          if ("action" in item) {
            indexRef.current += 1;
            if (handleAction(item)) return;
            continue;
          }
          appendChar(item);
          indexRef.current += 1;
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    const startAnimation = () => {
      if (startedRef.current) return;
      startedRef.current = true;
      codeEl.innerHTML = "";
      hideDropdown();
      indexRef.current = 0;
      lastTimeRef.current = 0;
      playingRef.current = true;
      renderCaret();
      rafRef.current = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            startAnimation();
          }
        });
      },
      { threshold: 0.4 }
    );

    const target = containerRef.current || codeEl;
    observer.observe(target);

    return () => {
      observer.disconnect();
      clearTimeouts();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [codeLines]);

  return (
    <section className="relative w-full py-16 md:py-20 overflow-hidden">
      <div className="relative z-10 container mx-auto px-6 md:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-4">
            <span className="text-[#6E83FB]">Smart Order</span> Types built for{" "}
            <span className="text-[#6E83FB]">Speed</span>
          </h2>
          <p className="text-muted-foreground text-lg md:text-xl max-w-3xl mx-auto">
            Low-latency order types designed for fast execution, clean abstractions, and minimal overhead.
          </p>
        </div>
        <div className="grid gap-8 lg:grid-cols-[3fr_7fr] items-stretch">
          <div className="nc-order-stack">
            <div className="nc-order-card">
              <div className="nc-order-icon" aria-hidden="true">
                <svg viewBox="0 0 28 28" role="img" width="36" height="36">
                  <circle cx="14" cy="14" r="4.5" />
                </svg>
              </div>
              <div className="nc-order-title">
                <span className="text-[#6E83FB]">Single</span> Order
              </div>
              <div className="nc-order-desc">Place individual orders with precision</div>
            </div>
            <div className="nc-order-card">
              <div className="nc-order-icon" aria-hidden="true">
                <svg viewBox="0 0 28 28" role="img">
                  <rect x="4" y="4" width="20" height="20" rx="4" />
                  <circle cx="11" cy="11" r="2" />
                  <circle cx="17" cy="11" r="2" />
                  <circle cx="14" cy="17" r="2" />
                </svg>
              </div>
              <div className="nc-order-title">
                <span className="text-[#6E83FB]">Multi</span> Order
              </div>
              <div className="nc-order-desc">Execute multiple orders together</div>
            </div>
            <div className="nc-order-card">
              <div className="nc-order-icon" aria-hidden="true">
                <svg viewBox="0 0 28 28" role="img">
                  <path
                    d="M4 16 H24"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M4 20 L9 12 L19 12 L24 20"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="nc-order-title">
                <span className="text-[#6E83FB]">Flexi</span> Order
              </div>
              <div className="nc-order-desc">Deploy advanced option strategies natively</div>
            </div>
          </div>

          <div className="nc-card">
            <div className="nc-toolbar">
              <span className="nc-dot nc-dot--red" />
              <span className="nc-dot nc-dot--yellow" />
              <span className="nc-dot nc-dot--green" />
              <div className="nc-title">Crossover_Strategy.py</div>
            </div>
            <div ref={containerRef} className="nc-code-wrap">
              <pre className="nc-pre">
                <code ref={codeRef} className="nc-code-area" />
              </pre>
              <div ref={dropdownRef} className="nc-dropdown nc-dropdown--hidden">
                <div className="nc-dropdown__item" data-value="multi_order">
                  multi_order
                </div>
                <div className="nc-dropdown__item" data-value="modify_order_v2">
                  modify_order_v2
                </div>
                <div className="nc-dropdown__item" data-value="mod_flexi_order">
                  mod_flexi_order
                </div>
                <div className="nc-dropdown__item" data-value="cancel_orders">
                  cancel_orders
                </div>
                <div className="nc-dropdown__item" data-value="cancel_order_by_id">
                  cancel_order_by_id
                </div>
                <div className="nc-dropdown__item" data-value="get_margin">
                  get_margin
                </div>
                <div className="nc-dropdown__item" data-value="flexi_order">
                  flexi_order
                </div>
                <div className="nc-dropdown__item" data-value="create_order">
                  create_order
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};







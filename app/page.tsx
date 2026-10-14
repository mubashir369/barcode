"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";

import A4Sheet, { BatchEntry } from "./components/A4Sheet";
import { downloadPrn, generatePrn } from "./lib/prnGenerator";

interface Stock {
  _id: string;
  barcode: string;
  itemName: string;
  brand: string;
  itemGroup: string;
  sellingPrice: number;
  purchasePrice?: number; // P.price (rename if your API uses a different field)
  qty?: number;
}

const money = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Home() {
  const barcodeRef = useRef<HTMLInputElement>(null);
  const offerRef = useRef<HTMLInputElement>(null);
  const printComponentRef = useRef<HTMLDivElement>(null);

  const [barcode, setBarcode] = useState("");
  const [item, setItem] = useState<Stock | null>(null);
  const [offer, setOffer] = useState("");
  const [printQty, setPrintQty] = useState("1");
  const [list, setList] = useState<BatchEntry[]>([]); // <-- the batch
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    barcodeRef.current?.focus();
  }, []);

  async function lookup(e: FormEvent) {
    e.preventDefault();
    const code = barcode.trim();
    if (!code) return;
    setLoading(true);
    setError("");
    setNotice("");
    setMenuOpen(false);
    try {
      const res = await fetch(`/api/stock/${encodeURIComponent(code)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lookup failed.");
      setItem(data);
      setOffer("");
      setPrintQty("1");
      setTimeout(() => offerRef.current?.focus(), 0);
    } catch (err) {
      setItem(null);
      setError(err instanceof Error ? err.message : "Lookup failed.");
      barcodeRef.current?.select();
    } finally {
      setLoading(false);
    }
  }

  const offerNum = offer.trim() === "" ? NaN : Number(offer);
  const offerInvalid = offer.trim() !== "" && (!Number.isFinite(offerNum) || offerNum < 0);
  const savings = item && Number.isFinite(offerNum) ? item.sellingPrice - offerNum : null;
  const overPriced = savings !== null && savings < 0;

  const qtyNum = Number(printQty);
  const qtyInvalid = !Number.isInteger(qtyNum) || qtyNum < 1 || qtyNum > 9999;

  // can the CURRENT item be added to the list?
  const canAdd = !!item && savings !== null && !offerInvalid && !overPriced && !qtyInvalid;

  // can we print the whole LIST?
  const canPrint = list.length > 0;
  const totalLabels = list.reduce((s, e) => s + e.printQty, 0);

  // combined PRN text for every entry in the list
  const prn = useMemo(
    () =>
      list
        .map((e) =>
          generatePrn({
            offerPrice: e.offerPrice,
            savedAmount: e.savedAmount,
            quantity: e.printQty,
          })
        )
        .join("\n"),
    [list]
  );

  function addToList() {
    if (!canAdd || !item) return;
    setList((prev) => [
      ...prev,
      {
        id: `${item.barcode}-${Date.now()}`,
        item,
        offerPrice: offerNum,
        savedAmount: savings!,
        printQty: qtyNum,
      },
    ]);
    setNotice(`Added ${item.itemName} to the list.`);
    setError("");
    // get ready for the next barcode
    setItem(null);
    setBarcode("");
    setOffer("");
    setPrintQty("1");
    setTimeout(() => barcodeRef.current?.focus(), 0);
  }

  function onEnterAdd(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addToList();
    }
  }

  function removeFromList(id: string) {
    setList((prev) => prev.filter((e) => e.id !== id));
  }

  function clearList() {
    setList([]);
    setNotice("");
    setMenuOpen(false);
  }

  const handlePrintA4 = useReactToPrint({
    contentRef: printComponentRef,
    documentTitle: "",
    onAfterPrint: () => setMenuOpen(false),
  });

  async function copyPrn() {
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(prn);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) {
      const ta = document.createElement("textarea");
      ta.value = prn;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      document.body.removeChild(ta);
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
      setError("Copy failed in this browser. Use Download PRN file instead.");
    }
  }

  // Thermal print: send every entry in the list, one after another
  async function printBarcode() {
    if (!canPrint) return;
    setMenuOpen(false);
    setPrinting(true);
    setNotice("");
    setError("");
    try {
      for (const e of list) {
        const res = await fetch("/api/print", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            offerPrice: e.offerPrice,
            savedAmount: e.savedAmount,
            quantity: e.printQty,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 501) {
          downloadPrn(prn, "labels-batch");
          setNotice("No printer is set up, so one PRN file with all labels was downloaded instead.");
          return;
        }
        if (!res.ok) throw new Error(data.error || `Printing failed for ${e.item.itemName}.`);
      }
      setNotice(`Sent ${totalLabels} label${totalLabels > 1 ? "s" : ""} to the printer.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Printing failed.");
    } finally {
      setPrinting(false);
    }
  }

  return (
    <>
      <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 print:hidden">
        <div className="mx-auto max-w-xl space-y-5">
          <h1 className="text-2xl font-semibold">Offer label printer</h1>

          <form onSubmit={lookup} className="flex gap-2">
            <input
              ref={barcodeRef}
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="Scan or type barcode"
              autoComplete="off"
              className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-3 text-lg outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-200"
            />
            <button
              disabled={loading || !barcode.trim()}
              className="rounded-lg bg-indigo-700 px-5 py-3 font-medium text-white hover:bg-indigo-800 disabled:opacity-50"
            >
              {loading ? "Searching…" : "Find item"}
            </button>
          </form>

          {error && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800">
              {notice}
            </p>
          )}

          {/* Current item being edited */}
          {item && (
            <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">{item.itemName}</h2>
                  <p className="text-slate-600">
                    {item.brand} · {item.itemGroup}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Barcode {item.barcode}
                    {item.qty !== undefined && ` · ${item.qty} in stock`}
                  </p>
                </div>
                <div className="flex gap-5 text-right">
                  {item.purchasePrice !== undefined && (
                    <div>
                      <p className="text-sm text-slate-500">Purchase price</p>
                      <p className="text-2xl font-semibold tabular-nums text-indigo-700">
                        {money(item.purchasePrice)}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-slate-500">Selling price</p>
                    <p className="text-2xl font-semibold tabular-nums">{money(item.sellingPrice)}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <label className="col-span-2 block">
                  <span className="mb-1 block text-sm font-medium">Offer price</span>
                  <input
                    ref={offerRef}
                    value={offer}
                    onChange={(e) => setOffer(e.target.value)}
                    onKeyDown={onEnterAdd}
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    placeholder="e.g. 400"
                    className="w-full rounded-lg border border-slate-300 px-4 py-3 text-lg tabular-nums outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-200"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Print qty</span>
                  <input
                    value={printQty}
                    onChange={(e) => setPrintQty(e.target.value)}
                    onKeyDown={onEnterAdd}
                    type="number"
                    min={1}
                    max={9999}
                    step={1}
                    inputMode="numeric"
                    className="w-full rounded-lg border border-slate-300 px-4 py-3 text-lg tabular-nums outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-200"
                  />
                </label>
              </div>

              {offerInvalid && <p className="text-sm text-red-700">Enter a valid price of 0 or more.</p>}
              {qtyInvalid && <p className="text-sm text-red-700">Print quantity must be a whole number from 1 to 9999.</p>}
              {overPriced && (
                <p className="text-sm text-amber-700">
                  Offer price is higher than the selling price, so there are no savings to print.
                </p>
              )}

              {item.purchasePrice !== undefined && !offerInvalid && Number.isFinite(offerNum) && offerNum < item.purchasePrice && (
                <p className="text-sm text-amber-700">
                  Offer price is below the purchase price ({money(item.purchasePrice)}). You will sell at a loss of{" "}
                  {money(item.purchasePrice - offerNum)} per item.
                </p>
              )}

              <div className="rounded-lg bg-emerald-50 px-4 py-3">
                <p className="text-sm text-emerald-800">Customer saves</p>
                <p className="text-3xl font-semibold tabular-nums text-emerald-900">
                  {savings !== null && !overPriced ? money(savings) : "—"}
                </p>
              </div>

              <button
                disabled={!canAdd}
                onClick={addToList}
                className="w-full rounded-lg bg-indigo-700 px-5 py-3 font-medium text-white hover:bg-indigo-800 disabled:opacity-40"
              >
                Add to list
              </button>
            </section>
          )}

          {/* The batch list */}
          {list.length > 0 && (
            <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  Print list ({list.length} item{list.length > 1 ? "s" : ""}, {totalLabels} label
                  {totalLabels > 1 ? "s" : ""})
                </h2>
                <button onClick={clearList} className="text-sm text-red-700 hover:underline">
                  Clear all
                </button>
              </div>

              <ul className="divide-y divide-slate-100">
                {list.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{e.item.itemName}</p>
                      <p className="text-sm text-slate-500">
                        {e.item.barcode}
                        {e.item.purchasePrice !== undefined && ` · P.price ${money(e.item.purchasePrice)}`}
                        {" "}· MRP {money(e.item.sellingPrice)} → Offer{" "}
                        <span className="font-medium text-slate-800">{money(e.offerPrice)}</span> · Saves{" "}
                        {money(e.savedAmount)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-sm tabular-nums">
                        × {e.printQty}
                      </span>
                      <button
                        onClick={() => removeFromList(e.id)}
                        aria-label={`Remove ${e.item.itemName}`}
                        className="text-slate-400 hover:text-red-700"
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap items-start gap-2">
                <div className="relative">
                  <button
                    disabled={!canPrint || printing}
                    onClick={() => setMenuOpen((o) => !o)}
                    aria-expanded={menuOpen}
                    className="rounded-lg bg-indigo-700 px-5 py-2.5 font-medium text-white hover:bg-indigo-800 disabled:opacity-40"
                  >
                    {printing ? "Printing…" : "Print all"}
                  </button>
                  {menuOpen && canPrint && (
                    <div className="absolute left-0 top-full z-10 mt-2 w-64 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                      <button
                        onClick={printBarcode}
                        className="block w-full px-4 py-3 text-left hover:bg-slate-50"
                      >
                        <span className="block font-medium">Print barcode</span>
                        <span className="block text-sm text-slate-500">
                          Thermal labels, {totalLabels} total
                        </span>
                      </button>
                      <button
                        onClick={() => handlePrintA4()}
                        className="block w-full border-t border-slate-100 px-4 py-3 text-left hover:bg-slate-50"
                      >
                        <span className="block font-medium">Print A4</span>
                        <span className="block text-sm text-slate-500">All items on A4 sheet(s)</span>
                      </button>
                    </div>
                  )}
                </div>

                <button
                  disabled={!canPrint}
                  onClick={() => downloadPrn(prn, "labels-batch")}
                  className="rounded-lg border border-slate-300 px-4 py-2.5 font-medium hover:bg-slate-50 disabled:opacity-40"
                >
                  Download PRN file
                </button>
                <button
                  disabled={!canPrint}
                  onClick={copyPrn}
                  className="rounded-lg border border-slate-300 px-4 py-2.5 font-medium hover:bg-slate-50 disabled:opacity-40"
                >
                  {copied ? "Copied" : "Copy PRN text"}
                </button>
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Printable Sheet Wrapper: receives the whole list */}
      {canPrint && (
        <div ref={printComponentRef}>
          <A4Sheet entries={list} />
        </div>
      )}
    </>
  );
}
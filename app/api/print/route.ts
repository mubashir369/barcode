import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { generatePrn } from "@/app/lib/prnGenerator";


const run = promisify(execFile);

export async function POST(req: Request) {
  const printer = process.env.PRINTER_NAME;
  if (!printer) {
    return NextResponse.json({ error: "PRINTER_NAME is not set." }, { status: 501 });
  }
  const host = process.env.PRINTER_HOST || "localhost";
  if (!/^[\w.-]+$/.test(host)) {
    return NextResponse.json({ error: "PRINTER_HOST has invalid characters." }, { status: 500 });
  }
  if (!/^[\w .-]+$/.test(printer)) {
    return NextResponse.json({ error: "PRINTER_NAME has invalid characters." }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const offerPrice = Number(body?.offerPrice);
  const savedAmount = Number(body?.savedAmount);
  const quantity = Number(body?.quantity);

  if (
    !Number.isFinite(offerPrice) || offerPrice < 0 ||
    !Number.isFinite(savedAmount) || savedAmount < 0 ||
    !Number.isInteger(quantity) || quantity < 1 || quantity > 9999
  ) {
    return NextResponse.json({ error: "Invalid price or quantity." }, { status: 400 });
  }

  const dir = await mkdtemp(path.join(tmpdir(), "prn-"));
  const file = path.join(dir, "label.prn");
  try {
    await writeFile(file, generatePrn({ offerPrice, savedAmount, quantity }), "latin1");

    if (process.platform === "win32") {
      await run("cmd.exe", ["/c", "copy", "/b", file, `\\\\${host}\\${printer}`]);
    } else {
      await run("lp", ["-d", printer, "-o", "raw", file]);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Print failed:", err);
    return NextResponse.json(
      { error: "Could not send to the printer. Check the printer name and sharing." },
      { status: 500 }
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
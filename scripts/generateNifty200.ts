
import * as fs from 'fs';
import * as path from 'path';
import stockData from '../src/data/stocks_isin.json';

const CSV_PATH = path.join(__dirname, '../src/data/ind_nifty500list.csv');
const OUTPUT_PATH = path.join(__dirname, '../src/data/nifty500.json');

// Interface for stockData
interface StockMeta {
    EXCH_ID: string;
    SECURITY_ID: string;
    SYMBOL_NAME: string;
    DISPLAY_NAME: string;
    UNDERLYING_SYMBOL: string;
    ISIN: string;
    SOURCE: string;
    INSTRUMENT_TYPE: string;
}

const stocks = stockData as Record<string, StockMeta>;

// Reverse mapping: Symbol -> ISIN
const symbolToISIN: Record<string, string> = {};
for (const [isin, meta] of Object.entries(stocks)) {
    if (!meta) continue;
    // Store both underlying symbol and symbol name key for fallback
    if (meta.UNDERLYING_SYMBOL) {
        symbolToISIN[meta.UNDERLYING_SYMBOL] = isin;
        // Also try adding .NS mapping just in case
        symbolToISIN[meta.UNDERLYING_SYMBOL + ".NS"] = isin;
    }
}

try {
    if (!fs.existsSync(CSV_PATH)) {
        console.error(`CSV file not found at ${CSV_PATH}`);
        process.exit(1);
    }
    const csvContent = fs.readFileSync(CSV_PATH, 'utf-8');
    const lines = csvContent.split('\n'); // Split by lines (assuming LF or CRLF)

    // Index of nifty 200 column (3rd column => index 2) - Legacy
    const NIFTY_200_INDEX = 2;
    const nifty200ISINs: string[] = [];
    const missingSymbols: string[] = [];

    // Start from line 1 (skip header)
    const header = lines[0]?.trim();
    if (!header) throw new Error("Empty CSV");

    // Simple header parsing
    const headerCols = header.split(',').map(c => c.trim().replace(/['"]+/g, ''));

    // Check for "ISIN Code" column (New Format)
    const isinCodeIndex = headerCols.findIndex(c => c.toLowerCase() === 'isin code');

    if (isinCodeIndex !== -1) {
        console.log(`Detected generic CSV format. Using 'ISIN Code' at column ${isinCodeIndex}`);

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i]?.trim();
            if (!line) continue;

            const cols = line.split(',');

            if (cols.length > isinCodeIndex) {
                const isin = cols[isinCodeIndex]?.trim();
                // Basic validation: ISINs are usually 12 chars
                if (isin && isin.length === 12) {
                    if (!nifty200ISINs.includes(isin)) {
                        nifty200ISINs.push(isin);
                    }
                }
            }
        }
    } else {
        // Fallback to Old NSE Indices Matrix Format
        console.log("Using legacy NSE Indices Matrix parsing...");
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i]?.trim();
            if (!line) continue;
            const cols = line.split(',');

            if (cols.length > NIFTY_200_INDEX) {
                const rawSymbol = cols[NIFTY_200_INDEX]?.trim();
                if (rawSymbol) {
                    // Remove .NS suffix
                    const cleanSymbol = rawSymbol.replace('.NS', '');

                    // Lookup ISIN
                    const isin = symbolToISIN[cleanSymbol] || symbolToISIN[rawSymbol];

                    if (isin) {
                        if (!nifty200ISINs.includes(isin)) {
                            nifty200ISINs.push(isin);
                        }
                    } else {
                        // Only track missing if we are actually trying to map symbols
                        missingSymbols.push(cleanSymbol);
                    }
                }
            }
        }
    }

    // Write output
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(nifty200ISINs, null, 2));

    console.log(`Successfully generated Nifty 200 ISIN list.`);
    console.log(`Total Found: ${nifty200ISINs.length}`);
    if (missingSymbols.length > 0) {
        console.log(`Missing Symbols: ${missingSymbols.length}`);
        console.log(`Missing: ${missingSymbols.slice(0, 10).join(', ')}...`);
    }

} catch (error) {
    console.error("Error generating Nifty 200 list:", error);
}

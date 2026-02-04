import React, { useState, useMemo } from "react";
import Papa from "papaparse";
import {
  Upload,
  FileDown,
  Plus,
  Trash2,
  FileText,
  AlertCircle,
  ScanBarcode,
  User,
} from "lucide-react";

function App() {
  const [data, setData] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [fileName, setFileName] = useState("");
  const [barcodeCol, setBarcodeCol] = useState("");

  const [ranges, setRanges] = useState([]);
  const [currentRange, setCurrentRange] = useState({
    start: "",
    end: "",
    patientId: "",
  });

  // Handle File Upload
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setFileName(file.name);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setHeaders(results.meta.fields || []);

        // Try to auto-detect barcode column
        const probableBarcode = results.meta.fields.find(
          (f) =>
            f.toLowerCase().includes("tubenumber") ||
            f.toLowerCase().includes("id") ||
            f.toLowerCase().includes("vial"),
        );
        const detectedBarcodeCol = probableBarcode || results.meta.fields[0];

        // Filter out rows where barcode equals "EMPTY" or "ERROR"
        // Keep all rows, including "EMPTY" or "ERROR" ones (they will be excluded visually later)
        const filteredData = results.data;

        setData(filteredData);
        setBarcodeCol(detectedBarcodeCol);
      },
    });
  };

  // Add Range
  const addRange = () => {
    if (!currentRange.start || !currentRange.end || !currentRange.patientId)
      return;

    // Check for overlaps with existing ranges
    const hasOverlap = ranges.some((existingRange) => {
      // Determine if values are numeric
      const isNumeric =
        !isNaN(currentRange.start) &&
        !isNaN(currentRange.end) &&
        !isNaN(existingRange.start) &&
        !isNaN(existingRange.end);

      if (isNumeric) {
        const newStart = parseFloat(currentRange.start);
        const newEnd = parseFloat(currentRange.end);
        const existStart = parseFloat(existingRange.start);
        const existEnd = parseFloat(existingRange.end);

        // Check if ranges overlap: (newStart <= existEnd) && (newEnd >= existStart)
        return newStart <= existEnd && newEnd >= existStart;
      } else {
        // String comparison for overlap
        const newStart = currentRange.start;
        const newEnd = currentRange.end;
        const existStart = existingRange.start;
        const existEnd = existingRange.end;

        return newStart <= existEnd && newEnd >= existStart;
      }
    });

    if (hasOverlap) {
      alert(
        "⚠️ Range Overlap Detected!\n\nThe tube number range you entered overlaps with an existing mapping rule. Please adjust the range to avoid conflicts.",
      );
      return;
    }

    setRanges([...ranges, { ...currentRange, id: Date.now() }]);
    setCurrentRange({ start: "", end: "", patientId: "" });
  };

  const removeRange = (id) => {
    setRanges(ranges.filter((r) => r.id !== id));
  };

  // Processed Data
  const processedData = useMemo(() => {
    if (!data.length || !barcodeCol) return [];

    return data
      .filter((row) => {
        // Only filter out rows with no barcode value at all
        const barcodeVal = row[barcodeCol];
        return !!barcodeVal;
      })
      .map((row) => {
        const barcodeVal = row[barcodeCol];
        const upperValue = barcodeVal.toString().toUpperCase().trim();
        const isExcluded = upperValue === "EMPTY" || upperValue === "ERROR";

        // Simple numeric comparison if possible, else string comparison
        // Assuming barcodes might be numeric strings.
        // We will check if the barcode falls into any range.
        // NOTE: String comparison for barcodes can be tricky (10 < 2).
        // We'll try to convert to numbers if both start/end/value are numeric.

        let matchedPatientId = null;

        // Don't try to match excluded barcodes
        if (!isExcluded) {
          for (const range of ranges) {
            const isNumeric =
              !isNaN(range.start) && !isNaN(range.end) && !isNaN(barcodeVal);

            if (isNumeric) {
              const s = parseFloat(range.start);
              const e = parseFloat(range.end);
              const v = parseFloat(barcodeVal);
              if (v >= s && v <= e) {
                matchedPatientId = range.patientId;
                break;
              }
            } else {
              // Lexicographical string comparison
              if (barcodeVal >= range.start && barcodeVal <= range.end) {
                matchedPatientId = range.patientId;
                break;
              }
            }
          }
        }

        return {
          ...row,
          processed_patient_id: matchedPatientId || "",
          is_excluded: isExcluded,
        };
      });
  }, [data, ranges, barcodeCol]);

  // Check if all valid barcodes are mapped
  const allValidBarcodesAreMapped = useMemo(() => {
    if (!processedData.length) return false;

    // Check if there are any valid barcodes without a patient ID
    const hasUnmappedValidBarcodes = processedData.some((row) => {
      const barcodeValue = row[barcodeCol];
      if (!barcodeValue) return false; // Skip empty barcodes

      const upperValue = barcodeValue.toString().toUpperCase();
      // If it's a valid barcode (not EMPTY or ERROR) and has no patient ID, it's unmapped
      if (upperValue !== "EMPTY" && upperValue !== "ERROR") {
        return !row.processed_patient_id;
      }
      return false;
    });

    return !hasUnmappedValidBarcodes;
  }, [processedData, barcodeCol]);

  // Calculate unmapped ranges
  const unmappedRanges = useMemo(() => {
    if (!processedData.length) return [];

    // Get all unmapped tube numbers
    const unmappedNumbers = processedData
      .filter((row) => !row.processed_patient_id)
      .map((row) => {
        const val = row[barcodeCol];
        return !isNaN(val) ? parseFloat(val) : val;
      })
      .filter((val) => typeof val === "number")
      .sort((a, b) => a - b);

    if (unmappedNumbers.length === 0) return [];

    // Group consecutive numbers into ranges
    const ranges = [];
    let rangeStart = unmappedNumbers[0];
    let rangeEnd = unmappedNumbers[0];

    for (let i = 1; i < unmappedNumbers.length; i++) {
      if (unmappedNumbers[i] === rangeEnd + 1) {
        rangeEnd = unmappedNumbers[i];
      } else {
        ranges.push({ start: rangeStart, end: rangeEnd });
        rangeStart = unmappedNumbers[i];
        rangeEnd = unmappedNumbers[i];
      }
    }
    ranges.push({ start: rangeStart, end: rangeEnd });

    return ranges;
  }, [processedData, barcodeCol]);

  // Export
  const exportCSV = () => {
    // Start with processedData and apply strict filtering
    const exportData = processedData
      .filter((row) => {
        const barcodeValue = row[barcodeCol];
        // Exclude if no barcode value in the selected column
        if (!barcodeValue) return false;
        // Exclude if selected barcode column is "EMPTY" or "ERROR" (case-insensitive)
        const upperValue = barcodeValue.toString().toUpperCase().trim();
        if (upperValue === "EMPTY" || upperValue === "ERROR") return false;

        // Also check if there's a separate "Barcode" column and filter those
        if (row.Barcode) {
          const barcodeColValue = row.Barcode.toString().toUpperCase().trim();
          if (barcodeColValue === "EMPTY" || barcodeColValue === "ERROR")
            return false;
        }

        return true;
      })
      .map((row) => {
        // Create a new object excluding internal fields
        const exportRow = {};

        // Copy all fields except the internal ones
        Object.keys(row).forEach((key) => {
          if (key !== "processed_patient_id" && key !== "is_excluded") {
            exportRow[key] = row[key];
          }
        });

        // Add the Patient ID column
        exportRow["Patient ID"] = row.processed_patient_id || "";

        return exportRow;
      });

    const csv = Papa.unparse(exportData);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "processed_" + fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="app-container">
      <header>
        <div
          style={{
            background: "linear-gradient(135deg, #6366f1, #a855f7)",
            padding: "0.5rem",
            borderRadius: "8px",
          }}
        >
          <ScanBarcode color="white" size={24} />
        </div>
        <h1>Biospecimen Barcode Mapper</h1>
        <div style={{ marginLeft: "auto" }}>
          {processedData.length > 0 && (
            <button
              className="btn btn-primary"
              onClick={exportCSV}
              disabled={!allValidBarcodesAreMapped}
              style={{
                opacity: allValidBarcodesAreMapped ? 1 : 0.5,
                cursor: allValidBarcodesAreMapped ? "pointer" : "not-allowed",
              }}
              title={
                allValidBarcodesAreMapped
                  ? "Export CSV"
                  : "All valid barcodes must be mapped to a Patient ID before exporting"
              }
            >
              <FileDown size={18} />
              Export CSV
            </button>
          )}
        </div>
      </header>

      <div className="main-layout">
        {/* Left Panel: Controls */}
        <aside className="panel-left">
          {/* Range Config Card */}
          <div className="card" style={{ flex: 1 }}>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <User size={18} className="text-accent" />
              Patient Mapping
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0.75rem",
              }}
            >
              <div>
                <label>Start TubeNumber</label>
                <input
                  type="number"
                  value={currentRange.start}
                  onChange={(e) =>
                    setCurrentRange({ ...currentRange, start: e.target.value })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addRange();
                    }
                  }}
                  placeholder="e.g. 1001"
                />
              </div>
              <div>
                <label>End TubeNumber</label>
                <input
                  type="number"
                  value={currentRange.end}
                  onChange={(e) =>
                    setCurrentRange({ ...currentRange, end: e.target.value })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addRange();
                    }
                  }}
                  placeholder="e.g. 1050"
                />
              </div>
            </div>
            <div style={{ marginTop: "0.75rem" }}>
              <label>Assign Patient ID</label>
              <input
                value={currentRange.patientId}
                onChange={(e) =>
                  setCurrentRange({
                    ...currentRange,
                    patientId: e.target.value,
                  })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addRange();
                  }
                }}
                placeholder="e.g. PID-001"
              />
            </div>

            <button
              className="btn btn-primary"
              style={{ marginTop: "1rem", width: "100%" }}
              onClick={addRange}
            >
              <Plus size={18} />
              Add Mapping Rule
            </button>

            <div className="range-list">
              {ranges.length === 0 && (
                <div
                  className="empty-state"
                  style={{ padding: "1rem", fontSize: "0.85rem" }}
                >
                  No mapping rules defined
                </div>
              )}
              {ranges.map((r) => (
                <div key={r.id} className="range-item">
                  <div className="range-info">
                    <span className="range-patient">{r.patientId}</span>
                    <span className="range-ids">
                      {r.start} → {r.end}
                    </span>
                  </div>
                  <button
                    className="btn btn-danger"
                    onClick={() => removeRange(r.id)}
                    title="Remove rule"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            {/* Unmapped Ranges */}
            {unmappedRanges.length > 0 && (
              <div style={{ marginTop: "1.5rem" }}>
                <h3
                  style={{
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    color: "#eab308",
                    marginBottom: "0.75rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <AlertCircle size={16} />
                  Unmapped Ranges
                </h3>
                <div className="range-list" style={{ marginTop: 0 }}>
                  {unmappedRanges.map((r, idx) => (
                    <div
                      key={idx}
                      className="range-item"
                      style={{
                        background: "rgba(234, 179, 8, 0.1)",
                        borderColor: "rgba(234, 179, 8, 0.3)",
                      }}
                    >
                      <div className="range-info">
                        <span style={{ color: "#eab308", fontWeight: 600 }}>
                          {r.start === r.end
                            ? r.start
                            : `${r.start} → ${r.end}`}
                        </span>
                        <span
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {r.start === r.end
                            ? "1 tube"
                            : `${r.end - r.start + 1} tubes`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Upload Card */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Upload size={18} className="text-accent" />
              Source Data
            </h2>

            <div
              className="dropzone"
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.classList.add("active");
              }}
              onDragLeave={(e) => {
                e.currentTarget.classList.remove("active");
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove("active");
                const file = e.dataTransfer.files[0];
                if (file && file.name.endsWith(".csv")) {
                  handleFileUpload({ target: { files: [file] } });
                }
              }}
            >
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                style={{ display: "none" }}
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                style={{ cursor: "pointer", margin: 0 }}
              >
                <FileText
                  className="dropzone-icon"
                  style={{ margin: "0 auto 1rem auto", display: "block" }}
                />
                <div style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                  {fileName ? fileName : "Click to Upload CSV"}
                </div>
                <div
                  style={{
                    fontSize: "0.8rem",
                    color: "var(--text-secondary)",
                    marginTop: "0.5rem",
                  }}
                >
                  Drag and drop or browse
                </div>
              </label>
            </div>

            {headers.length > 0 && (
              <div style={{ marginTop: "1rem" }}>
                <label>TubeNumber Column</label>
                <select
                  value={barcodeCol}
                  onChange={(e) => setBarcodeCol(e.target.value)}
                >
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </aside>

        {/* Right Panel: Data Preview */}
        <main className="panel-right card" style={{ padding: 0 }}>
          {processedData.length === 0 ? (
            <div className="empty-state">
              <AlertCircle
                size={48}
                style={{ opacity: 0.2, marginBottom: "1rem" }}
              />
              <p>Upload a CSV file to begin mapping</p>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: "50px" }}>#</th>
                    <th>{barcodeCol} (TubeNumber)</th>
                    <th style={{ color: "var(--success)" }}>
                      Mapped Patient ID
                    </th>
                    {headers
                      .filter((h) => h !== barcodeCol)
                      .map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {processedData.map((row, idx) => (
                    <tr
                      key={idx}
                      style={{
                        backgroundColor: row.is_excluded
                          ? "rgba(30, 41, 59, 0.8)" // Much darker, more opaque
                          : !row.processed_patient_id
                            ? "rgba(234, 179, 8, 0.15)"
                            : "transparent",
                        opacity: row.is_excluded ? 0.6 : 1, // Slightly less opacity fade
                      }}
                    >
                      <td style={{ color: "var(--text-secondary)" }}>
                        {idx + 1}
                      </td>
                      <td
                        style={{
                          fontWeight: "600",
                          color: row.is_excluded
                            ? "var(--text-secondary)"
                            : "var(--accent)",
                        }}
                      >
                        {row[barcodeCol]}
                      </td>
                      <td>
                        {row.is_excluded ? (
                          <span
                            style={{
                              color: "var(--text-secondary)",
                              fontStyle: "italic",
                              fontSize: "0.8rem",
                            }}
                          >
                            Excluded
                          </span>
                        ) : row.processed_patient_id ? (
                          <span
                            className="tag"
                            style={{
                              background: "rgba(16, 185, 129, 0.15)",
                              color: "#34d399",
                            }}
                          >
                            {row.processed_patient_id}
                          </span>
                        ) : (
                          <span
                            style={{
                              color: "#eab308",
                              fontStyle: "italic",
                              fontSize: "0.8rem",
                              fontWeight: "600",
                            }}
                          >
                            Unmapped
                          </span>
                        )}
                      </td>
                      {headers
                        .filter((h) => h !== barcodeCol)
                        .map((h) => (
                          <td key={h}>{row[h]}</td>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;

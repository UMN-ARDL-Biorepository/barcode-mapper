import React, { useState, useMemo, useEffect } from "react";
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
  Sun,
  Moon,
  Monitor,
} from "lucide-react";

function App() {
  const [data, setData] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [fileName, setFileName] = useState("");
  const [barcodeCol, setBarcodeCol] = useState("");
  const [columnCol, setColumnCol] = useState("");
  const [rowCol, setRowCol] = useState("");
  const [mappingMode, setMappingMode] = useState("column"); // "tube" or "column"

  const [ranges, setRanges] = useState([]);
  const [currentRange, setCurrentRange] = useState({
    start: "",
    end: "",
    patientId: "",
  });

  // Theme management
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark" || saved === "system") {
      return saved;
    }
    return "system";
  });

  // Apply theme preference and persist it
  useEffect(() => {
    // Persist the chosen preference ("light", "dark", or "system")
    localStorage.setItem("theme", theme);

    // Determine which theme should actually be applied
    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const appliedTheme = mediaQuery.matches ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", appliedTheme);
    } else {
      document.documentElement.setAttribute("data-theme", theme);
    }
  }, [theme]);

  // Listen for system theme changes when following system preferences
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const applySystemTheme = (matches) => {
      const appliedTheme = matches ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", appliedTheme);
    };

    const handleChange = (e) => {
      if (theme === "system") {
        applySystemTheme(e.matches);
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);

  const toggleTheme = () => {
    // Cycle through: system -> light -> dark -> system
    setTheme((prev) => {
      if (prev === "system") return "light";
      if (prev === "light") return "dark";
      return "system";
    });
  };

  // Handle File Upload
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setFileName(file.name);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      complete: (results) => {
        setHeaders(results.meta.fields || []);

        // Try to auto-detect barcode column
        const detectedBarcodeCol =
          results.meta.fields.find((f) => {
            const low = f.toLowerCase();
            return low === "tubenumber" || low === "barcode" || low === "vial";
          }) ||
          results.meta.fields.find((f) => {
            const low = f.toLowerCase();
            return (
              low.includes("tubenumber") ||
              low.includes("id") ||
              low.includes("vial")
            );
          }) ||
          results.meta.fields[0];

        // Try to auto-detect column column
        const detectedColumnCol =
          results.meta.fields.find((f) => {
            const low = f.trim().toLowerCase();
            return low === "column" || low === "col";
          }) ||
          results.meta.fields.find((f) => {
            const low = f.toLowerCase();
            return (
              low.includes("column") ||
              low.includes("col") ||
              low.includes("position")
            );
          }) ||
          results.meta.fields[Math.min(1, results.meta.fields.length - 1)];

        // Try to auto-detect row column
        const detectedRowCol =
          results.meta.fields.find((f) => {
            const low = f.trim().toLowerCase();
            return low === "row" || low === "r";
          }) ||
          results.meta.fields.find((f) => {
            const low = f.toLowerCase();
            return low.includes("row") || low === "r";
          }) ||
          results.meta.fields[Math.min(2, results.meta.fields.length - 1)];

        setData(results.data);
        setBarcodeCol(detectedBarcodeCol);
        setColumnCol(detectedColumnCol);
        setRowCol(detectedRowCol);
      },
    });
  };

  // Add Range
  const addRange = () => {
    if (!currentRange.start || !currentRange.end || !currentRange.patientId)
      return;

    // Check for overlaps with existing ranges of the same mode
    const hasOverlap = ranges.some((existingRange) => {
      // Only check overlap for the same mapping mode
      if (existingRange.mode !== mappingMode) return false;

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
        `⚠️ Range Overlap Detected!\n\nThe ${mappingMode === "tube" ? "tube number" : "column"} range you entered overlaps with an existing mapping rule. Please adjust the range to avoid conflicts.`,
      );
      return;
    }

    setRanges([
      ...ranges,
      { ...currentRange, id: Date.now(), mode: mappingMode },
    ]);
    setCurrentRange({ start: "", end: "", patientId: "" });
  };

  const removeRange = (id) => {
    setRanges(ranges.filter((r) => r.id !== id));
  };

  // Processed Data
  const processedData = useMemo(() => {
    if (!data.length || !barcodeCol) return [];

    return data
      .map((row) => {
        const barcodeVal = row[barcodeCol];
        const valStr = barcodeVal ? barcodeVal.toString() : "";
        const upperValue = valStr.toUpperCase().trim();

        // Exclude if explicitly "EMPTY"/"ERROR" or if the value is actually empty/blank
        const isExcluded =
          upperValue === "EMPTY" || upperValue === "ERROR" || upperValue === "";

        let matchedPatientId = null;

        // Don't try to match excluded barcodes
        if (!isExcluded) {
          for (const range of ranges) {
            // Use either barcode value or column value based on the range's mode
            const targetVal =
              range.mode === "column" ? row[columnCol] : row[barcodeCol];

            const isNumeric =
              !isNaN(range.start) && !isNaN(range.end) && !isNaN(targetVal);

            if (isNumeric) {
              const s = parseFloat(range.start);
              const e = parseFloat(range.end);
              const v = parseFloat(targetVal);
              if (v >= s && v <= e) {
                matchedPatientId = range.patientId;
                break;
              }
            } else {
              // Lexicographical string comparison
              if (targetVal >= range.start && targetVal <= range.end) {
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
      })
      .filter((row) => !row.is_excluded)
      .sort((a, b) => {
        if (mappingMode === "column") {
          // Sort by Column (Number)
          const colA = parseFloat(a[columnCol]) || 0;
          const colB = parseFloat(b[columnCol]) || 0;
          if (colA !== colB) return colA - colB;

          // Then by Row (String: A, B, C...)
          const rowA = (a[rowCol] || "").toString();
          const rowB = (b[rowCol] || "").toString();
          return rowA.localeCompare(rowB);
        }
        return 0; // Maintain original order for tube mode
      });
  }, [data, ranges, barcodeCol, columnCol, rowCol, mappingMode]);

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

    const currentModeCol = mappingMode === "column" ? columnCol : barcodeCol;

    // Get all unmapped values for the current mode
    const rawUnmapped = processedData
      .filter((row) => !row.processed_patient_id && !row.is_excluded)
      .map((row) => {
        const val = row[currentModeCol];
        return !isNaN(val) ? parseFloat(val) : val;
      })
      .filter((val) => typeof val === "number");

    // Ensure values are unique (important when multiple rows share the same column)
    const unmappedValues = [...new Set(rawUnmapped)].sort((a, b) => a - b);

    if (unmappedValues.length === 0) return [];

    // Group consecutive numbers into ranges
    const ranges = [];
    let rangeStart = unmappedValues[0];
    let rangeEnd = unmappedValues[0];

    for (let i = 1; i < unmappedValues.length; i++) {
      if (unmappedValues[i] === rangeEnd + 1) {
        rangeEnd = unmappedValues[i];
      } else {
        ranges.push({ start: rangeStart, end: rangeEnd });
        rangeStart = unmappedValues[i];
        rangeEnd = unmappedValues[i];
      }
    }
    ranges.push({ start: rangeStart, end: rangeEnd });

    return ranges;
  }, [processedData, barcodeCol, columnCol, mappingMode]);

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
          <ScanBarcode color="var(--icon-color)" size={24} />
        </div>
        <h1>Biospecimen Barcode Mapper</h1>
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: "1rem",
          }}
        >
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            title={
              theme === "system"
                ? "Theme: System (click to switch to Light)"
                : theme === "light"
                  ? "Theme: Light (click to switch to Dark)"
                  : "Theme: Dark (click to switch to System)"
            }
          >
            {theme === "system" ? (
              <Monitor size={20} />
            ) : theme === "light" ? (
              <Sun size={20} />
            ) : (
              <Moon size={20} />
            )}
          </button>

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
            <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
              <User size={18} className="text-accent" />
              Patient Mapping
            </h2>

            <div
              style={{
                display: "flex",
                background: "var(--input-bg)",
                padding: "4px",
                borderRadius: "8px",
                marginBottom: "1rem",
              }}
            >
              <button
                style={{
                  flex: 1,
                  padding: "0.5rem",
                  fontSize: "0.8rem",
                  borderRadius: "6px",
                  border: "none",
                  background:
                    mappingMode === "column" ? "var(--accent)" : "transparent",
                  color:
                    mappingMode === "column"
                      ? "var(--accent-text)"
                      : "var(--text-secondary)",
                }}
                onClick={() => setMappingMode("column")}
              >
                By Column (1-12)
              </button>
              <button
                style={{
                  flex: 1,
                  padding: "0.5rem",
                  fontSize: "0.8rem",
                  borderRadius: "6px",
                  border: "none",
                  background:
                    mappingMode === "tube" ? "var(--accent)" : "transparent",
                  color:
                    mappingMode === "tube"
                      ? "var(--accent-text)"
                      : "var(--text-secondary)",
                }}
                onClick={() => setMappingMode("tube")}
              >
                By TubeNumber
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0.75rem",
              }}
            >
              <div>
                <label>
                  Start {mappingMode === "tube" ? "TubeNumber" : "Column"}
                </label>
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
                  placeholder={mappingMode === "tube" ? "e.g. 1001" : "e.g. 1"}
                />
              </div>
              <div>
                <label>
                  End {mappingMode === "tube" ? "TubeNumber" : "Column"}
                </label>
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
                  placeholder={mappingMode === "tube" ? "e.g. 1050" : "e.g. 12"}
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
                    <span className="range-patient">
                      {r.patientId}{" "}
                      <span
                        style={{
                          fontSize: "0.65rem",
                          padding: "1px 4px",
                          borderRadius: "4px",
                          background: "var(--badge-bg)",
                          color: "var(--text-secondary)",
                          marginLeft: "4px",
                          verticalAlign: "middle",
                        }}
                      >
                        {r.mode === "column" ? "Col" : "Tube"}
                      </span>
                    </span>
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
                    color: "var(--warning-text)",
                    marginBottom: "0.75rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <AlertCircle size={16} />
                  Unmapped{" "}
                  {mappingMode === "tube" ? "Tube Ranges" : "Column Ranges"}
                </h3>
                <div className="range-list" style={{ marginTop: 0 }}>
                  {unmappedRanges.map((r, idx) => (
                    <div
                      key={idx}
                      className="range-item"
                      style={{
                        background: "var(--warning-bg)",
                        borderColor: "var(--warning-border)",
                      }}
                    >
                      <div className="range-info">
                        <span
                          style={{
                            color: "var(--warning-text)",
                            fontWeight: 600,
                          }}
                        >
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
                            ? `1 ${mappingMode === "tube" ? "tube" : "column"}`
                            : `${r.end - r.start + 1} ${mappingMode === "tube" ? "tubes" : "columns"}`}
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
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: "0.75rem",
                  marginTop: "1rem",
                }}
              >
                <div>
                  <label>TubeNumber Col</label>
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
                <div>
                  <label>Plate Column Col</label>
                  <select
                    value={columnCol}
                    onChange={(e) => setColumnCol(e.target.value)}
                  >
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Row Col</label>
                  <select
                    value={rowCol}
                    onChange={(e) => setRowCol(e.target.value)}
                  >
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
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
                    <th>{barcodeCol} (Tube)</th>
                    <th>{columnCol} (Col)</th>
                    <th>{rowCol} (Row)</th>
                    <th style={{ color: "var(--success)" }}>
                      Mapped Patient ID
                    </th>
                    {headers
                      .filter(
                        (h) =>
                          h !== barcodeCol && h !== columnCol && h !== rowCol,
                      )
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
                        backgroundColor: !row.processed_patient_id
                          ? "var(--warning-bg)"
                          : "transparent",
                      }}
                    >
                      <td style={{ color: "var(--text-secondary)" }}>
                        {idx + 1}
                      </td>
                      <td
                        style={{
                          fontWeight: mappingMode === "tube" ? "600" : "400",
                          color:
                            mappingMode === "tube"
                              ? "var(--accent)"
                              : "var(--text-secondary)",
                        }}
                      >
                        {row[barcodeCol]}
                      </td>
                      <td
                        style={{
                          fontWeight: mappingMode === "column" ? "600" : "400",
                          color:
                            mappingMode === "column"
                              ? "var(--accent)"
                              : "var(--text-secondary)",
                        }}
                      >
                        {row[columnCol]}
                      </td>
                      <td
                        style={{
                          color: "var(--text-secondary)",
                        }}
                      >
                        {row[rowCol]}
                      </td>
                      <td>
                        {row.processed_patient_id ? (
                          <span
                            className="tag"
                            style={{
                              background: "var(--success-bg)",
                              color: "var(--success)",
                            }}
                          >
                            {row.processed_patient_id}
                          </span>
                        ) : (
                          <span
                            style={{
                              color: "var(--warning-text)",
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
                        .filter(
                          (h) =>
                            h !== barcodeCol && h !== columnCol && h !== rowCol,
                        )
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

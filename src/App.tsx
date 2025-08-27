import { useState } from "react";
import * as XLSX from "xlsx"; // Excel export support

export default function App() {
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [, setExtractedData] = useState(""); // only keep setter
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Store extracted rows
  const [allExtracted, setAllExtracted] = useState<string[][]>([]);

  const headers = [
    "Order Number",
    "Recipient's Name",
    "Phone Number",
    "Standby Phone",
    "State",
    "City",
    "Recipient Street",
  ];

  const handleExtract = async () => {
    setExtractedData("");
    setError("");

    if (imageFiles.length === 0) {
      setError("Please select or capture at least one image first.");
      return;
    }

    setLoading(true);

    try {
      for (const imageFile of imageFiles) {
        const reader = new FileReader();
        reader.readAsDataURL(imageFile);

        await new Promise<void>((resolveReader) => {
          reader.onloadend = async () => {
            const base64Data = (reader.result as string).split(",")[1];

            const prompt = `Extract the following information from the image and format it as a CSV string. 
            The first row should be headers: "Order Number", "Recipient's Name", "Phone Number", "Standby Phone", "State", "City", "Recipient Street". 
            The second row should be the data. If a field is not present, use "N/A".`;

            const payload = {
              contents: [
                {
                  role: "user",
                  parts: [
                    { text: prompt },
                    {
                      inlineData: {
                        mimeType: imageFile.type,
                        data: base64Data,
                      },
                    },
                  ],
                },
              ],
            };

            const apiKey = import.meta.env.VITE_GEMINI_API_KEY; // 🔑 use .env
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

            let apiResponse;
            let retries = 0;
            const maxRetries = 5;
            const initialDelay = 1000; while (retries < maxRetries) {
              try {
                apiResponse = await fetch(apiUrl, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload),
                });

                if (apiResponse.ok) break;
                else if (apiResponse.status === 429) {
                  const delay = initialDelay * Math.pow(2, retries);
                  await new Promise((resolve) => setTimeout(resolve, delay));
                  retries++;
                } else {
                  throw new Error(`API call failed with status: ${apiResponse.status}`);
                }
              } catch (e) {
                if (retries < maxRetries - 1) {
                  const delay = initialDelay * Math.pow(2, retries);
                  await new Promise((resolve) => setTimeout(resolve, delay));
                  retries++;
                } else throw e;
              }
            }

            if (!apiResponse || !apiResponse.ok) {
              throw new Error("API call failed after multiple retries.");
            }

            const result = await apiResponse.json();

            if (
              result.candidates &&
              result.candidates.length > 0 &&
              result.candidates[0].content &&
              result.candidates[0].content.parts &&
              result.candidates[0].content.parts.length > 0
            ) {
              const text = result.candidates[0].content.parts[0].text.trim();
              setExtractedData(text);

              
              // ✅ Parse CSV string into array
              const rows = text.split("\n").map((row: string) => row.split(","));

              setAllExtracted((prev) => {
                if (prev.length === 0) {
                  // If first batch → include headers + data
                  return rows;
                } else {
                  // If already have data → append only new rows (skip header)
                  return [...prev, ...rows.slice(1)];
                }
              });
            } else {
              setError("Could not extract data. Please try another image.");
            }

            resolveReader();
          };
        });
      }
    } catch (err: any) {
      setError(`An error occurred: ${err.message}`);
    }

    setLoading(false);
  };

  // Update cell when edited
  const handleEditCell = (rowIdx: number, colIdx: number, value: string) => {
    setAllExtracted((prev) => {
      const updated = [...prev];
      updated[rowIdx] = [...updated[rowIdx]];
      updated[rowIdx][colIdx] = value;
      return updated;
    });
  };

  // Download CSV
  const handleDownloadCSV = () => {
    if (allExtracted.length === 0) {
      setError("No data to download.");
      return;
    }

    const csvContent =
      [headers.join(","), ...allExtracted.map((row) => row.join(","))].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "extracted_data.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Download Excel
  const handleDownloadExcel = () => {
    if (allExtracted.length === 0) {
      setError("No data to download.");
      return;
    }

    const worksheetData = [headers, ...allExtracted];
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Extracted Data");

    XLSX.writeFile(workbook, "extracted_data.xlsx");
  };

  return (
    <div className="flex flex-col items-center justify-center p-4 min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200">
      <div className="w-full max-w-5xl bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl">
        <h1 className="text-3xl font-extrabold text-center mb-4">
          Mapxpress Sharp Courier Data Extractor
        </h1>
        <p className="text-center text-gray-600 dark:text-gray-400 mb-6">
          Upload or capture multiple shipping labels to extract structured data.
        </p>

        {/* Upload + Camera Capture */}
        <div className="flex flex-col md:flex-row space-y-4 md:space-x-4 mb-6">
          {/* File upload (multiple allowed) */}
          <input
            type="file"
            multiple
            onChange={(e) => setImageFiles(Array.from(e.target.files || []))}
            accept="image/*"
            className="flex-1 p-3 border rounded-lg"
          />

          {/* Camera capture (single shot at a time, but appends) */}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) =>
              setImageFiles((prev) => [
                ...prev,
                ...(e.target.files ? Array.from(e.target.files) : []),
              ])
            }
            className="flex-1 p-3 border rounded-lg"
          />

          <button
            onClick={handleExtract}
            disabled={loading || imageFiles.length === 0}
            className={`px-6 py-3 rounded-lg text-white ${loading || imageFiles.length === 0
                ? "bg-blue-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700"
              }`}
          >
            {loading ? "Extracting..." : "Extract Data"}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-100 text-red-700 px-4 py-3 rounded-lg mb-6">
            <p>{error}</p>
          </div>
        )}

        {/* Preview Editable Table */}
        {allExtracted.length > 0 && (
          <div className="overflow-x-auto mt-6">
            <h2 className="text-lg font-bold mb-3">Preview & Edit Extracted Rows:</h2>
            <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600 text-sm">
              <thead className="bg-gray-200 dark:bg-gray-700">
                <tr>
                  {headers.map((header) => (
                    <th
                      key={header}
                      className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left font-semibold"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allExtracted.map((row, rowIdx) => (
                  <tr key={rowIdx} className="odd:bg-gray-50 dark:odd:bg-gray-800">
                    {row.map((cell, colIdx) => (
                      <td
                        key={colIdx}
                        className="border border-gray-300 dark:border-gray-600 px-2 py-1"
                      >
                        <input
                          type="text"
                          value={cell.trim()}
                          onChange={(e) =>
                            handleEditCell(rowIdx, colIdx, e.target.value)
                          }
                          className="w-full p-1 bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-500 rounded"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Download Buttons */}
        {allExtracted.length > 0 && (
          <div className="mt-6 flex space-x-4">
            <button
              onClick={handleDownloadCSV}
              className="px-6 py-3 rounded-lg text-white bg-green-600 hover:bg-green-700"
            >
              Download CSV
            </button>
            <button
              onClick={handleDownloadExcel}
              className="px-6 py-3 rounded-lg text-white bg-purple-600 hover:bg-purple-700"
            >
              Download Excel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

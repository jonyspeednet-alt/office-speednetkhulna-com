import * as XLSX from "xlsx";

/**
 * Generate and download a sample Excel file for Channel Partner User Import
 */
export const downloadUserImportSample = () => {
  const data = [
    {
      "Customer Name": "Abir Hasan",
      "Receive Amount": 630,
      "Not Paid": 0,
    },
    {
      "Customer Name": "Sabbir Ahmed",
      "Receive Amount": 0,
      "Not Paid": 630,
    },
    {
      "Customer Name": "Kamal Hossain",
      "Receive Amount": 400,
      "Not Paid": 230,
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "User Collection");

  // Set column widths
  const wscols = [
    { wch: 30 }, // Customer Name
    { wch: 15 }, // Receive Amount
    { wch: 15 }, // Not Paid
  ];
  worksheet["!cols"] = wscols;

  XLSX.writeFile(workbook, "channel_user_import_sample.xlsx");
};

/**
 * Generate and download a sample Excel file for Partner Advances Import
 */
export const downloadAdvanceImportSample = () => {
  const data = [
    {
      "User Name": "Abir Hasan",
      "Advance Amount": 1000,
      "Advance Type": "direct_payment",
      Notes: "Paid to partner for equipment",
    },
    {
      "User Name": "Sabbir Ahmed",
      "Advance Amount": 500,
      "Advance Type": "adjustment",
      Notes: "Previous month adjustment",
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Partner Advances");

  // Set column widths
  const wscols = [
    { wch: 30 }, // User Name
    { wch: 15 }, // Advance Amount
    { wch: 20 }, // Advance Type
    { wch: 40 }, // Notes
  ];
  worksheet["!cols"] = wscols;

  XLSX.writeFile(workbook, "partner_advances_sample.xlsx");
};

"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FileSpreadsheet,
  Download,
  Play,
  Save,
  Plus,
  X,
  Filter,
  SortAsc,
  BarChart3,
} from "lucide-react";
import Link from "next/link";

interface ReportConfig {
  name: string;
  dataSource: string;
  columns: string[];
  filters: { field: string; operator: string; value: string }[];
  sortBy: string;
  sortOrder: "asc" | "desc";
  groupBy?: string;
  dateRange: { start: string; end: string };
}

const dataSources = [
  { value: "orders", label: "Orders", columns: ["orderNumber", "status", "type", "total", "tip", "createdAt", "staff", "table"] },
  { value: "customers", label: "Customers", columns: ["name", "email", "phone", "totalOrders", "totalSpent", "loyalty", "createdAt"] },
  { value: "staff", label: "Staff", columns: ["name", "position", "hourlyRate", "totalHours", "totalSales", "totalTips"] },
  { value: "menuItems", label: "Menu Items", columns: ["name", "category", "price", "cost", "margin", "orderCount"] },
  { value: "inventory", label: "Inventory", columns: ["name", "currentStock", "parLevel", "reorderPoint", "cost", "vendor"] },
  { value: "reservations", label: "Reservations", columns: ["customerName", "partySize", "date", "time", "status", "table"] },
];

const operators = [
  { value: "equals", label: "Equals" },
  { value: "not_equals", label: "Not Equals" },
  { value: "greater_than", label: "Greater Than" },
  { value: "less_than", label: "Less Than" },
  { value: "contains", label: "Contains" },
  { value: "starts_with", label: "Starts With" },
];

export default function CustomReportBuilderPage() {
  const [config, setConfig] = useState<ReportConfig>({
    name: "New Report",
    dataSource: "orders",
    columns: ["orderNumber", "status", "total", "createdAt"],
    filters: [],
    sortBy: "createdAt",
    sortOrder: "desc",
    dateRange: {
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      end: new Date().toISOString().split("T")[0],
    },
  });

  const [previewData, setPreviewData] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [savedReports, setSavedReports] = useState<{ name: string; config: ReportConfig }[]>([]);

  const currentDataSource = dataSources.find((d) => d.value === config.dataSource);

  const addFilter = () => {
    setConfig({
      ...config,
      filters: [
        ...config.filters,
        { field: currentDataSource?.columns[0] || "", operator: "equals", value: "" },
      ],
    });
  };

  const removeFilter = (index: number) => {
    const newFilters = [...config.filters];
    newFilters.splice(index, 1);
    setConfig({ ...config, filters: newFilters });
  };

  const updateFilter = (
    index: number,
    field: "field" | "operator" | "value",
    value: string
  ) => {
    const newFilters = [...config.filters];
    newFilters[index] = { ...newFilters[index], [field]: value };
    setConfig({ ...config, filters: newFilters });
  };

  const toggleColumn = (column: string) => {
    const newColumns = config.columns.includes(column)
      ? config.columns.filter((c) => c !== column)
      : [...config.columns, column];
    setConfig({ ...config, columns: newColumns });
  };

  const runReport = async () => {
    setLoading(true);
    try {
      // Build query parameters
      const params = new URLSearchParams({
        dataSource: config.dataSource,
        columns: config.columns.join(","),
        sortBy: config.sortBy,
        sortOrder: config.sortOrder,
        startDate: config.dateRange.start,
        endDate: config.dateRange.end,
      });

      if (config.filters.length > 0) {
        params.set("filters", JSON.stringify(config.filters));
      }
      if (config.groupBy) {
        params.set("groupBy", config.groupBy);
      }

      const response = await fetch(`/api/reports/custom?${params.toString()}`);
      const data = await response.json();
      setPreviewData(Array.isArray(data) ? data : data.data || []);
    } catch (error) {
      console.error("Error running report:", error);
    } finally {
      setLoading(false);
    }
  };

  const saveReport = () => {
    const existing = savedReports.findIndex((r) => r.name === config.name);
    if (existing >= 0) {
      const newReports = [...savedReports];
      newReports[existing] = { name: config.name, config };
      setSavedReports(newReports);
    } else {
      setSavedReports([...savedReports, { name: config.name, config }]);
    }
  };

  const exportCSV = () => {
    if (previewData.length === 0) return;

    const headers = config.columns.join(",");
    const rows = previewData.map((row) =>
      config.columns.map((col) => {
        const value = row[col];
        if (value === null || value === undefined) return "";
        const stringValue = String(value);
        // Escape quotes and wrap in quotes if contains comma
        if (stringValue.includes(",") || stringValue.includes('"')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      }).join(",")
    );

    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${config.name.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Custom Report Builder</h1>
          <p className="text-muted-foreground">Create custom reports from your data</p>
        </div>
        <Link href="/reports">
          <Button variant="outline">
            <BarChart3 className="h-4 w-4 mr-2" />
            Standard Reports
          </Button>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Configuration Panel */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Report Configuration</CardTitle>
              <CardDescription>Define your report parameters</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Report Name</Label>
                <Input
                  value={config.name}
                  onChange={(e) => setConfig({ ...config, name: e.target.value })}
                  placeholder="My Custom Report"
                />
              </div>

              <div className="space-y-2">
                <Label>Data Source</Label>
                <Select
                  value={config.dataSource}
                  onValueChange={(value) =>
                    setConfig({
                      ...config,
                      dataSource: value,
                      columns: dataSources.find((d) => d.value === value)?.columns.slice(0, 4) || [],
                      filters: [],
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {dataSources.map((ds) => (
                      <SelectItem key={ds.value} value={ds.value}>
                        {ds.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Date Range</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="date"
                    value={config.dateRange.start}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        dateRange: { ...config.dateRange, start: e.target.value },
                      })
                    }
                  />
                  <Input
                    type="date"
                    value={config.dateRange.end}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        dateRange: { ...config.dateRange, end: e.target.value },
                      })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Columns</Label>
                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                  {currentDataSource?.columns.map((col) => (
                    <div key={col} className="flex items-center gap-2">
                      <Checkbox
                        checked={config.columns.includes(col)}
                        onCheckedChange={() => toggleColumn(col)}
                      />
                      <span className="text-sm capitalize">{col.replace(/([A-Z])/g, " $1")}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Filters</Label>
                  <Button variant="ghost" size="sm" onClick={addFilter}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {config.filters.map((filter, index) => (
                  <div key={index} className="flex gap-1 items-center">
                    <Select
                      value={filter.field}
                      onValueChange={(v) => updateFilter(index, "field", v)}
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {currentDataSource?.columns.map((col) => (
                          <SelectItem key={col} value={col}>
                            {col}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={filter.operator}
                      onValueChange={(v) => updateFilter(index, "operator", v)}
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {operators.map((op) => (
                          <SelectItem key={op.value} value={op.value}>
                            {op.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="Value"
                      value={filter.value}
                      onChange={(e) => updateFilter(index, "value", e.target.value)}
                      className="w-20"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeFilter(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label>Sort By</Label>
                  <Select
                    value={config.sortBy}
                    onValueChange={(v) => setConfig({ ...config, sortBy: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {currentDataSource?.columns.map((col) => (
                        <SelectItem key={col} value={col}>
                          {col}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Order</Label>
                  <Select
                    value={config.sortOrder}
                    onValueChange={(v: "asc" | "desc") =>
                      setConfig({ ...config, sortOrder: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asc">Ascending</SelectItem>
                      <SelectItem value="desc">Descending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Group By (optional)</Label>
                <Select
                  value={config.groupBy || "none"}
                  onValueChange={(v) =>
                    setConfig({ ...config, groupBy: v === "none" ? undefined : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {currentDataSource?.columns.map((col) => (
                      <SelectItem key={col} value={col}>
                        {col}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                <Button onClick={runReport} disabled={loading} className="flex-1">
                  <Play className="h-4 w-4 mr-2" />
                  {loading ? "Running..." : "Run Report"}
                </Button>
                <Button variant="outline" onClick={saveReport}>
                  <Save className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {savedReports.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Saved Reports</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {savedReports.map((report, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 rounded-lg bg-muted cursor-pointer hover:bg-muted/80"
                      onClick={() => setConfig(report.config)}
                    >
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="h-4 w-4" />
                        <span className="text-sm">{report.name}</span>
                      </div>
                      <Badge variant="secondary">{report.config.dataSource}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Preview Panel */}
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Report Preview</CardTitle>
                  <CardDescription>
                    {previewData.length} results
                    {config.filters.length > 0 && (
                      <span className="ml-2">
                        <Filter className="h-3 w-3 inline mr-1" />
                        {config.filters.length} filters
                      </span>
                    )}
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  onClick={exportCSV}
                  disabled={previewData.length === 0}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {previewData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <FileSpreadsheet className="h-16 w-16 mb-4" />
                  <p>Run the report to see data</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {config.columns.map((col) => (
                          <TableHead key={col} className="capitalize">
                            <div className="flex items-center gap-1">
                              {col.replace(/([A-Z])/g, " $1")}
                              {config.sortBy === col && (
                                <SortAsc
                                  className={`h-3 w-3 ${
                                    config.sortOrder === "desc" ? "rotate-180" : ""
                                  }`}
                                />
                              )}
                            </div>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewData.slice(0, 50).map((row, index) => (
                        <TableRow key={index}>
                          {config.columns.map((col) => (
                            <TableCell key={col}>
                              {formatCellValue(row[col])}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {previewData.length > 50 && (
                    <p className="text-sm text-muted-foreground text-center py-2">
                      Showing 50 of {previewData.length} results. Export to see all.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "number") {
    if (value % 1 !== 0) return value.toFixed(2);
    return value.toLocaleString();
  }
  if (value instanceof Date || (typeof value === "string" && value.match(/^\d{4}-\d{2}-\d{2}/))) {
    return new Date(value as string).toLocaleDateString();
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

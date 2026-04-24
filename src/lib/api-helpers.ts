import { NextRequest, NextResponse } from "next/server";

export interface PaginationParams {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export function getPaginationParams(request: NextRequest): PaginationParams {
  const searchParams = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20")));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export function paginatedResponse<T>(data: T[], totalItems: number, params: PaginationParams): PaginatedResponse<T> {
  return {
    data,
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / params.pageSize),
    },
  };
}

export interface SortParams {
  sortBy: string;
  sortDirection: "asc" | "desc";
}

export function getSortParams(request: NextRequest, defaultField: string = "createdAt"): SortParams {
  const searchParams = request.nextUrl.searchParams;
  const sortBy = searchParams.get("sortBy") || defaultField;
  const sortDirection = (searchParams.get("sortDirection") || "desc") as "asc" | "desc";
  return { sortBy, sortDirection };
}

export function handleApiError(error: unknown, context: string = "API"): NextResponse {
  console.error(`[${context}] Error:`, error);

  if (error instanceof Error) {
    if (error.message.includes("Unique constraint")) {
      return NextResponse.json({ error: "A record with this value already exists" }, { status: 409 });
    }
    if (error.message.includes("Record to update not found") || error.message.includes("Record to delete does not exist")) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }
    if (error.message.includes("Foreign key constraint")) {
      return NextResponse.json({ error: "Cannot delete this record because it is referenced by other records" }, { status: 409 });
    }
  }

  return NextResponse.json({ error: `Failed to process ${context} request` }, { status: 500 });
}

export function getClientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0] ||
         request.headers.get("x-real-ip") ||
         "unknown";
}

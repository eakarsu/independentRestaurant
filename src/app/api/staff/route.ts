import { withAccess, MANAGEMENT } from "@/lib/commerce/access";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { getPaginationParams, getSortParams, paginatedResponse, handleApiError } from "@/lib/api-helpers";

async function handleGET(request: NextRequest) {
  try {
    const pagination = getPaginationParams(request);
    const sort = getSortParams(request, "firstName");

    const [staff, total] = await Promise.all([
      prisma.staff.findMany({
        orderBy: { [sort.sortBy]: sort.sortDirection },
        skip: pagination.skip,
        take: pagination.take,
        include: {
          user: {
            select: { email: true, role: true },
          },
        },
      }),
      prisma.staff.count(),
    ]);

    return NextResponse.json(paginatedResponse(staff, total, pagination));
  } catch (error) {
    return handleApiError(error, "Staff");
  }
}

async function handlePOST(request: NextRequest) {
  const { z } = await import("zod");
  const input = z.object({firstName:z.string().trim().min(1).max(100),lastName:z.string().trim().min(1).max(100),email:z.string().email().toLowerCase(),phone:z.string().max(40).optional(),position:z.string().min(1).max(100),hourlyRate:z.number().min(0).max(10000),password:z.string().min(14).max(200),role:z.enum(["MANAGER","OPERATOR","STAFF","HOST","CHEF"])}).safeParse(await request.json());
  if (!input.success) return NextResponse.json({error:input.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ')},{status:422});
  const data=input.data;
  const password=await bcrypt.hash(data.password,12);
  const staff=await prisma.$transaction(async tx=>{
    const user=await tx.user.create({data:{email:data.email,name:`${data.firstName} ${data.lastName}`,password,role:data.role}});
    return tx.staff.create({data:{userId:user.id,firstName:data.firstName,lastName:data.lastName,phone:data.phone,position:data.position,hourlyRate:data.hourlyRate},include:{user:{select:{email:true,role:true}}}});
  });
  return NextResponse.json(staff,{status:201});
}

export const GET = withAccess(MANAGEMENT, handleGET);

export const POST = withAccess(["ADMIN", "MERCHANT"], handlePOST);

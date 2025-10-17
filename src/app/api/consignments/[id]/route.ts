import { NextRequest, NextResponse } from "next/server";
import { ConsignmentDB } from "@/services/database";
import { ConsignmentService } from "@/services/consignmentService";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const consignment = await ConsignmentDB.getConsignment(id);
  return NextResponse.json({ success: true, consignment });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();

  const service = new ConsignmentService();
  const consignment = await service.updateConsignment(id, body);

  return NextResponse.json({ success: true, consignment });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const service = new ConsignmentService();
  await service.withdrawConsignment(id);

  return NextResponse.json({ success: true });
}

import { NextRequest, NextResponse } from "next/server";
import { buildFacilityReport, CmsError } from "@/lib/cms";

// A valid CMS Certification Number is six characters (digits or, rarely, a
// letter in position 3). We accept 6 alphanumerics and normalize to upper-case.
const CCN_PATTERN = /^[A-Za-z0-9]{6}$/;

export async function GET(
  _req: NextRequest,
  { params }: { params: { ccn: string } }
) {
  const ccn = (params.ccn ?? "").trim().toUpperCase();

  if (!CCN_PATTERN.test(ccn)) {
    return NextResponse.json(
      {
        error: "invalid_ccn",
        message:
          "Enter a valid 6-character CMS Certification Number (e.g. 686123).",
      },
      { status: 400 }
    );
  }

  try {
    const report = await buildFacilityReport(ccn);
    return NextResponse.json(report, { status: 200 });
  } catch (err) {
    if (err instanceof CmsError) {
      const message =
        err.status === 404
          ? `No nursing home matches CCN ${ccn}. Check the number and try again.`
          : err.message;
      return NextResponse.json(
        { error: err.status === 404 ? "not_found" : "cms_unavailable", message },
        { status: err.status === 404 ? 404 : 502 }
      );
    }
    return NextResponse.json(
      {
        error: "unexpected",
        message: "Something went wrong building the report. Please try again.",
      },
      { status: 500 }
    );
  }
}

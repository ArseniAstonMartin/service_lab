import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { Search } from "lucide-react";
import { prisma } from "@/lib/db";
import { requestSiteUrls } from "@/lib/site-urls";
import { parseDirectorySearch } from "@/lib/domain/contact";
import { PageIntro, ActionLink } from "@/components/marketing/ui";
import { logServerError } from "@/lib/log";
export const metadata: Metadata = {
  title: "ECU & Module Compatibility Directory",
  alternates: { canonical: "/ecu-models" },
};
export const dynamic = "force-dynamic";

/**
 * Public search summary only — never the raw catalog rows. The full,
 * 16,000+ row compatibility table (part numbers, matched vehicles, and
 * which entries still need manual review) is admin-only, at
 * /admin/compatibility (gated by requireAdmin()). This page lets a
 * regular visitor search by part number/vehicle/module and see how many
 * entries matched, then hands them to the order wizard, which re-checks
 * the exact part number server-side anyway (checkCompatibility never
 * trusts anything computed here) — so there is nothing this listing
 * needs to expose row-by-row to do its job.
 */
async function loadDirectorySummary(q: string, make: string) {
  const where: Prisma.CompatibilityEntryWhereInput = {
    ...(make ? { vehicle: { make } } : {}),
    ...(q
      ? {
          OR: [
            { partNumber: { startsWith: q.toUpperCase() } },
            { vehicle: { model: { contains: q, mode: "insensitive" }, NOT: { model: "All" } } },
            { vehicle: { make: { contains: q, mode: "insensitive" } } },
            { category: { name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [count, makes] = await Promise.all([
    prisma.compatibilityEntry.count({ where }),
    prisma.vehicle.groupBy({
      by: ["make"],
      where: { compatibilityEntries: { some: {} } },
      orderBy: { make: "asc" },
    }),
  ]);
  return { count, makes };
}

export default async function DirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; make?: string }>;
}) {
  const { q, make } = parseDirectorySearch(await searchParams);
  const urls = await requestSiteUrls();
  const data = await loadDirectorySummary(q, make).catch((error) => {
    logServerError("public-coverage-directory", error);
    return null;
  });
  const searched = Boolean(q || make);
  return (
    <>
      <PageIntro
        eyebrow="ECU & models"
        title="Find your module. Know your options."
        description="Search our compatibility directory by catalog part number, make, model, or module category. Support is specific to the part number and the operation listed."
      />
      <section className="m-container m-page-section">
        <form className="m-directory-search" action="/ecu-models" role="search">
          <label htmlFor="directory-query">
            PART NUMBER, VEHICLE OR MODULE
            <input
              id="directory-query"
              name="q"
              defaultValue={q}
              placeholder="For example: 77960, Toyota, or Airbag"
              maxLength={100}
            />
          </label>
          <label htmlFor="directory-make">
            VEHICLE MAKE
            <select id="directory-make" name="make" defaultValue={make}>
              <option value="">All makes</option>
              {data?.makes.map((row) => (
                <option key={row.make} value={row.make}>
                  {row.make}
                </option>
              ))}
            </select>
          </label>
          <button className="m-button" type="submit">
            <Search size={17} />
            Search Directory
          </button>
        </form>
        {data ? (
          searched ? (
            data.count > 0 ? (
              <div className="m-empty-state">
                <h2>
                  {data.count.toLocaleString("en-US")} matching entr{data.count === 1 ? "y" : "ies"}
                  {q ? ` for “${q}”` : ""}
                </h2>
                <p>
                  Start a request with your exact module label and part number — we verify the
                  match, the vehicle, and any restrictions before payment. Individual catalog
                  entries aren’t listed publicly; our team can look one up on request.
                </p>
                <ActionLink href={`${urls.order}/order/vehicle`} icon="package">
                  Check Your Module
                </ActionLink>
              </div>
            ) : (
              <div className="m-empty-state">
                <h2>No matching modules found.</h2>
                <p>
                  Double-check the number on the label. An unlisted module can still be submitted
                  for manual review; we won’t assume support from a similar number.
                </p>
                <ActionLink href={`${urls.order}/order/vehicle`} icon="package">
                  Request a Compatibility Review
                </ActionLink>
              </div>
            )
          ) : (
            <p className="m-directory-note">
              Search by part number, make, model, or module category above. Matches are checked
              exactly — we don’t list the full catalog publicly, since a similar-looking part
              number doesn’t mean a similar module is supported.
            </p>
          )
        ) : (
          <div className="m-empty-state">
            <h2>The directory is temporarily unavailable.</h2>
            <p>
              You can still start a request and submit your module details for a compatibility
              check.
            </p>
            <ActionLink href={`${urls.order}/order/vehicle`}>Start a Request</ActionLink>
          </div>
        )}
        <p className="m-directory-note">
          A directory match does not confirm every operation or every vehicle application. Your
          request verifies the vehicle, exact module label, selected service, and any restrictions
          before payment.
        </p>
      </section>
    </>
  );
}

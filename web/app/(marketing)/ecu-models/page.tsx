import type { Metadata } from "next";
import Link from "next/link";
import { Prisma } from "@prisma/client";
import { ArrowRight, Search } from "lucide-react";
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
const PAGE_SIZE = 20;

async function loadDirectory(q: string, make: string, page: number) {
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
  const [entries, count, makes] = await Promise.all([
    prisma.compatibilityEntry.findMany({
      where,
      select: {
        id: true,
        partNumber: true,
        vehicle: { select: { make: true, model: true, year: true } },
        category: { select: { name: true } },
        services: { select: { service: { select: { name: true } } } },
      },
      orderBy: [{ partNumber: "asc" }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.compatibilityEntry.count({ where }),
    prisma.vehicle.groupBy({
      by: ["make"],
      where: { compatibilityEntries: { some: {} } },
      orderBy: { make: "asc" },
    }),
  ]);
  return { entries, count, makes };
}

export default async function DirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; make?: string; page?: string }>;
}) {
  const { q, make, page } = parseDirectorySearch(await searchParams);
  const urls = await requestSiteUrls();
  const data = await loadDirectory(q, make, page).catch((error) => {
    logServerError("public-coverage-directory", error);
    return null;
  });
  const pageHref = (nextPage: number) =>
    `/ecu-models?${new URLSearchParams({ q, make, page: String(nextPage) })}`;
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
          <>
            <div className="m-directory-status">
              <span>
                {data.count.toLocaleString("en-US")} matching entr{data.count === 1 ? "y" : "ies"}
                {q ? ` for “${q}”` : ""}
              </span>
              <span>Exact part numbers. Operation-specific support.</span>
            </div>
            {data.entries.length ? (
              <>
                <div className="m-results-scroll">
                  <table className="m-directory-table">
                    <thead>
                      <tr>
                        <th scope="col">Part number</th>
                        <th scope="col">Vehicle</th>
                        <th scope="col">Module</th>
                        <th scope="col">Available operation</th>
                        <th scope="col">
                          <span className="sr-only">Next step</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.entries.map((entry) => (
                        <tr key={entry.id.toString()}>
                          <td>{entry.partNumber}</td>
                          <td>
                            {entry.vehicle.make}
                            <small>
                              {entry.vehicle.model === "All"
                                ? "Model / year not specified"
                                : `${entry.vehicle.model} · ${entry.vehicle.year}`}
                            </small>
                          </td>
                          <td>{entry.category.name}</td>
                          <td>
                            {entry.services.length ? (
                              entry.services.map(({ service }) => (
                                <span key={service.name} className="m-status-badge">
                                  {service.name}
                                </span>
                              ))
                            ) : (
                              <span className="m-status-badge review">Manual review required</span>
                            )}
                          </td>
                          <td>
                            <a className="m-text-link" href={`${urls.order}/order/vehicle`}>
                              Check module
                              <ArrowRight size={13} />
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="m-pagination">
                  {page > 1 && <Link href={pageHref(page - 1)}>Previous</Link>}
                  <span>
                    Page {page} of {Math.max(1, Math.ceil(data.count / PAGE_SIZE))}
                  </span>
                  {page * PAGE_SIZE < data.count && <Link href={pageHref(page + 1)}>Next</Link>}
                </div>
              </>
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
            )}
          </>
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
          A directory listing does not confirm every operation or every vehicle application. Your
          request verifies the vehicle, exact module label, selected service, and any restrictions
          before payment. Entries marked for manual review do not automatically offer a service.
        </p>
      </section>
    </>
  );
}

/**
 * Constants shared by the coverage-source converter and the public
 * vehicle picker. Sentinel rows (Make + "All" + 2000) hold brand-level
 * part numbers from programmer dumps that had no model/year.
 */

export const COVERAGE_SENTINEL_MODEL = "All";
export const COVERAGE_SENTINEL_YEAR = 2000;

export const BATTERY_CATEGORY = "Battery/BMS";
export const TESLA_BATTERY_SERVICE = "Tesla Battery Reset";

export const DIAGNOSTICS_CATEGORY = "Vehicle Diagnostics";
export const VEHICLE_DIAGNOSTICS_SERVICE = "Vehicle Diagnostics";

// Order.partNumberEntered is NOT NULL -- a category with
// requiresPartNumber false (Vehicle Diagnostics) still needs something
// stored there, since there is no real schema change to make it
// optional just for this one case.
export const NO_PART_NUMBER_SENTINEL = "N/A";

// Order.returnAddress{Street,City,State,Zip} are all NOT NULL too --
// same reasoning. A category with no part number doesn't ship a module
// back, so there's no return address to collect; placeOrder stores
// these instead of whatever (if anything) the client sent, same as it
// does for partNumberEntered. returnAddressState is VarChar(2), hence
// "NA" rather than "N/A" there specifically.
export const NO_RETURN_ADDRESS_SENTINEL = {
  street: "N/A",
  city: "N/A",
  state: "NA",
  zip: "00000",
} as const;

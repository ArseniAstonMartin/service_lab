import { ModuleSelector } from "@/components/wizard/module-selector";
import { getModuleCategories } from "@/lib/actions/module";

export const dynamic = "force-dynamic";

export default async function OrderModulePage() {
  const categories = await getModuleCategories();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Which module are you repairing?</h1>
        <p className="text-sm text-muted-foreground">
          Pick the category that matches your part.
        </p>
      </div>
      <ModuleSelector categories={categories} />
    </div>
  );
}

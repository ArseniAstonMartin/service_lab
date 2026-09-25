import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/actions/auth";

export default function AdminHomePage() {
  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Admin</h1>
        <form action={signOut}>
          <Button type="submit" variant="outline" size="sm">
            Log out
          </Button>
        </form>
      </div>
      <p className="text-muted-foreground">Placeholder — built out in later tasks.</p>
    </div>
  );
}

import PeopleView from "@/components/PeopleView";
import { loadDataset } from "@/lib/data";

export const dynamic = "force-static";

export default function Page() {
  return <PeopleView ds={loadDataset()} />;
}

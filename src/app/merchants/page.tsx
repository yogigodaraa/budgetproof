import MerchantsView from "@/components/MerchantsView";
import { loadDataset } from "@/lib/data";

export const dynamic = "force-static";

export default function Page() {
  return <MerchantsView ds={loadDataset()} />;
}

import CategoriseView from "@/components/CategoriseView";
import { loadDataset } from "@/lib/data";

export const dynamic = "force-static";

export default function Categorise() {
  return <CategoriseView ds={loadDataset()} />;
}

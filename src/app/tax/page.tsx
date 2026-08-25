import TaxCentreView from "@/components/TaxCentreView";
import { loadDataset } from "@/lib/data";
export const dynamic = "force-static";
export default function Page() { return <TaxCentreView ds={loadDataset()} />; }

import DebtView from "@/components/DebtView";
import { loadDataset } from "@/lib/data";
export const dynamic = "force-static";
export default function Page() { return <DebtView ds={loadDataset()} />; }

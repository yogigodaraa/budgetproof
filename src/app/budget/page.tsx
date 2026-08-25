import BudgetView from "@/components/BudgetView";
import { loadDataset } from "@/lib/data";
export const dynamic = "force-static";
export default function Page() { return <BudgetView ds={loadDataset()} />; }

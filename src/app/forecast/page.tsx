import ForecastView from "@/components/ForecastView";
import { loadDataset } from "@/lib/data";
export const dynamic = "force-static";
export default function Page() { return <ForecastView ds={loadDataset()} />; }

import { openDataSql } from "./open-data-sql";
import { receipts } from "./receipts";
import { common } from "./common";
import { landing } from "./landing";
import { product } from "./product";
import { explorer } from "./explorer";
import { trade } from "./trade";
import { vault } from "./vault";
import { portfolio } from "./portfolio";
import { collectibles } from "./collectibles";
import { market } from "./market";
import { actions } from "./actions";
import { rwa } from "./rwa";
import { guide } from "./guide";
import { docs } from "./docs";
import { legal } from "./legal";
import { roadmap } from "./roadmap";
import { cloud } from "./cloud";
import { cards } from "./cards";
import { watch } from "./watch";
import { feed } from "./feed";
import { overlap } from "./overlap";
import { stress } from "./stress";
import { trades } from "./trades";
import { exit } from "./exit";

export const zhCN: Record<string, string> = {
  ...openDataSql,
  ...receipts,
  ...common,
  ...landing,
  ...product,
  ...explorer,
  ...trade,
  ...vault,
  ...portfolio,
  ...collectibles,
  ...market,
  ...actions,
  ...rwa,
  ...guide,
  ...docs,
  ...legal,
  ...roadmap,
  ...cloud,
  ...cards,
  ...watch,
  ...feed,
  ...overlap,
  ...stress,
  ...trades,
  ...exit,
};

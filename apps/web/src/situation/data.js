import news from "./news.json";
import market from "./event-market.json";
export const data = {
  news: {
    ...news,
    events: news.events.map((e) => ({
      ...e,
      image: new URL(`./photos/${e.id}.jpg`, import.meta.url).href,
    })),
  },
  market,
};
export const newsUrl = new URL("./news.json", import.meta.url).href;
export const marketUrl = new URL("./event-market.json", import.meta.url).href;

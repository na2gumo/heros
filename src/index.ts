import { load } from 'cheerio';
import { Embed, webhook } from 'discord-hono';
import { inArray, isNull, lt } from 'drizzle-orm';
import { drizzle, DrizzleD1Database } from 'drizzle-orm/d1';

import * as handlers from './cmd';
import { factory } from './init.js';
import { eros, monsnodes, pendings } from './schema.js';
import { fetchMonsode } from './source/monsnode.js';
import { fetchTwiVideo } from './source/twivideo.js';

const bot = factory
    // @ts-ignore
    .discord({ discordEnv: (env) => ({ ...env, TOKEN: env.BOT_TOKEN }) })
    .loader(Object.values(handlers));

bot.cron('* * * * *', async (ctx) => {
    const minutes = new Date(ctx.interaction.scheduledTime).getUTCMinutes();
    const db = drizzle(ctx.env.DB);

    switch (true) {
        case minutes % 30 === 0:
            console.log('Fetching monsode and twivideo videos');

            const mon = await fetchMonsode();
            console.log('Fetched monsode videos:', mon.length);
            //console.log(pen);
            if (mon.length) {
                await db.insert(monsnodes).values(mon.slice(0, 50)).onConflictDoNothing();
                if (mon.length > 50)
                    await db.insert(monsnodes).values(mon.slice(50, 100)).onConflictDoNothing();
            }

            const pen = await fetchTwiVideo();
            console.log('Fetched twivideo videos:', pen.length);
            //console.log(videos);
            if (pen.length) {
                await db.insert(pendings).values(pen.slice(0, 50)).onConflictDoNothing();
            }

            console.log('Complete');

            await db
                .delete(eros)
                .where(lt(eros.timestamp, new Date(Date.now() - 1000 * 60 * 60 * 24)))
                .limit(50);
            return;

        case minutes % 5 === 0:
            console.log('Send to discord');
            const videos = await db.select().from(eros).where(isNull(eros.timestamp)).limit(20);

            for (const [i, v] of Object.entries(videos)) {
                console.log(v);
                //send to discord channel
                // @ts-ignore
                await webhook(ctx.env.WEBHOOK_URL, genBody(v.thumbnail, v.src)).then((text) =>
                    console.log(text)
                );
                //2回に1度10秒スリープ
                if (Number(i) && Number(i) % 2 == 0) {
                    await sleep(10);
                }
            }

            await db
                .update(eros)
                .set({ timestamp: new Date() })
                .where(
                    inArray(
                        eros.thumbnail,
                        videos.map((v) => v.thumbnail)
                    )
                );

            console.log('used ' + videos.length);
            console.log('Complete');
            return;
        case minutes % 3 === 0:
            console.log('Running extract task');
            await workMonsode(db);
            console.log('Complete');
            return;
        default:
            console.log('Running upload task');
            // @ts-ignore
            await workUpload(ctx.env.UPLOADER, db);
            console.log('Complete');
            return;
    }
});

/*
function infinityDecode(text: string) {
    if (text.includes('%')) {
        text = decodeURIComponent(text);
        infinityDecode(text);
    }

    return text;
}
*/
function genBody(thumbnail: string, src: string) {
    return {
        content: '🎬 新動画発見',
        embeds: [new Embed().title('動画を開く').url(src).image({ url: thumbnail }).color(45300)],
    };
}

export async function workMonsode(db: DrizzleD1Database): Promise<void> {
    //サブリクエスト 最大50 -2query = 48
    const videos = await db.delete(monsnodes).limit(10).returning();
    console.log('get ' + videos.length);
    if (!videos.length) return;

    for (const [i, v] of Object.entries(videos)) {
        const html = await fetch(v.src).then((res) => res.text());
        const $ = load(html);

        const url = await new Promise((resolve) => {
            $('script').each((_, el) => {
                const text = $(el).text();
                for (const m of text.matchAll(/atob\((['"`])(.*?)\1\)/g)) {
                    const match = m[2];
                    const decoded = atob(match);
                    if (decoded.startsWith('https://video.twimg.com')) return resolve(decoded);
                }
            });
        });

        // @ts-ignore
        videos[Number(i)].src = url;
    }

    await db.insert(pendings).values(videos).onConflictDoNothing();
}
async function workUpload(uploader: string, db: DrizzleD1Database): Promise<void> {
    //サブリクエスト 5*9 = 45
    const videos = await db.delete(pendings).limit(5).returning();
    console.log('get ' + videos.length);
    if (!videos.length) return;

    let completed = 0;
    for (const [i, v] of Object.entries(videos)) {
        const resp = await fetch(uploader, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
            body: JSON.stringify(v),
        });
        if (!resp.ok) {
            console.error(resp.status + ': ' + (await resp.text()));
            continue;
        }

        videos[Number(i)] = await resp.json();
        completed++;
    }

    await db.insert(eros).values(videos).onConflictDoNothing();
    console.log(completed + ' completed');
}

// Cloudflare WorkersはsetTimeoutを使えないためhttpbin様様の力を借りてスリープする
async function sleep(seconds: number = 0): Promise<void> {
    if (!seconds) return;

    // @ts-expect-error
    await fetch(`https://httpbin.org/delay/${seconds}`, { cacheTtl: 0 });
}

export default bot;

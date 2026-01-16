import {
    APIChatInputApplicationCommandInteractionData,
    ApplicationCommandType,
    ApplicationIntegrationType,
    Locale,
} from 'discord-api-types/v10';
import { Command, CommandContext, Option } from 'discord-hono';
import { BAD_REQUEST_RESPONSE, ERROR_RESPONSE } from '../consts.js';
import { factory } from '../init.js';
import type { CommandSet } from '../types.js';

export const videoCommand: CommandSet = factory.command(
    new Command('video', 'Upload Video')
        .description_localizations({ [Locale.Japanese]: '画像をアップロード' })
        .type(ApplicationCommandType.ChatInput)
        .integration_types(
            ApplicationIntegrationType.GuildInstall,
            ApplicationIntegrationType.UserInstall
        )
        .options(
            new Option('file', 'Video File', 'Attachment')
                .name_localizations({ [Locale.Japanese]: 'ファイル' })
                .description_localizations({
                    [Locale.Japanese]: '動画ファイル',
                })
                .required(),
            new Option('public', 'Public Message', 'Boolean')
                .name_localizations({ [Locale.Japanese]: '公開' })
                .description_localizations({
                    [Locale.Japanese]: '公開メッセージにする',
                })
        ),
    async (ctx: CommandContext): Promise<Response> => {
        const source: APIChatInputApplicationCommandInteractionData = ctx.interaction.data as any;
        // @ts-ignore
        const attachment = source.resolved?.attachments[ctx.var['file']];

        return ctx // @ts-ignore
            .flags(...(ctx.var['public'] ? [] : ['EPHEMERAL']))
            .resDefer(async (ctx: CommandContext): Promise<void> => {
                const resp = await fetch(ctx.env.UPLOADER, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ src: attachment?.proxy_url }),
                });

                if (resp.ok) {
                    await ctx.followup('' + ((await resp.json()) as any)['src']);
                } else if (resp.status === 400) {
                    await ctx.followup(BAD_REQUEST_RESPONSE);
                } else {
                    await ctx.followup(ERROR_RESPONSE);
                }
            });
    }
);

export interface Video {
    thumbnail: string;
    src: string;
}
export type VideoNullable = Partial<Video>;

export type DiscordHonoBot = DiscordHono<
    {
        Bindings: Pick<Env, 'DB'>;
        Variables: Omit<Env, 'DB'>;
    },
    string
>;

export interface CommandSet {
    command: Command<{}>;
    handler: CommandHandler<EnvTypes>;
}

export interface EnvTypes {
    Bindings: Pick<Env, 'DB'>;
    Variables: Omit<Env, 'DB'>;
}

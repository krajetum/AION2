-- Each member's game server, from their card (the meter's profile, or the server picked when joining by typing a name):
-- a guild can hold players of several servers, and the official profile is looked up on the member's own server.
-- Null for cards sent before this: filled the next time the member's app sends its card.
ALTER TABLE guild_members ADD COLUMN server_id INTEGER;

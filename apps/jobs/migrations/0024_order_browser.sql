-- The browser an order was placed from, for the one conversion reported after it has gone.
--
-- Meta matches a server-side Purchase to an ad click by the buyer's browser: its address, its user
-- agent and the two cookies Meta's pixel set (_fbp, _fbc). The payment webhook arrives without a
-- browser, so these are kept with the order from the moment it is created — only when the visitor
-- said yes to the cookie question and the Conversions API is configured. Encrypted with DATA_KEY
-- like every other personal field; cleared as soon as the Purchase is reported, and by the nightly
-- sweep after seven days, which is as far back as Meta accepts an event.
ALTER TABLE orders ADD COLUMN browser_ct BLOB;
ALTER TABLE orders ADD COLUMN browser_nonce BLOB;

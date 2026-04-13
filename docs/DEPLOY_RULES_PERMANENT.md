# Deployment Rule (Permanent)

For `my.speednetkhulna.com`, frontend is now symlinked:
- `/home/speeuvmq/my.speednetkhulna.com/index.html` -> `/home/speeuvmq/office_app/client/dist/index.html`
- `/home/speeuvmq/my.speednetkhulna.com/assets` -> `/home/speeuvmq/office_app/client/dist/assets`

So only deploy here after frontend changes:
- `/home/speeuvmq/office_app/client/dist`

Backend deploy path remains:
- `/home/speeuvmq/office_app/server`

Do not upload frontend separately to `/home/speeuvmq/my.speednetkhulna.com` anymore.

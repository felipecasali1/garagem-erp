# Private storage for vehicle photos

Vehicle photos are private files managed through Supabase Storage, with each photo associated with its `Vehicle` and one photo chosen by the user as the preview. The application stores photo metadata and the Storage object path in its database; the existing `vehicles.image` field is superseded after any usable values are inspected and migrated. The gallery represents the vehicle's current photos, not a history of `Purchase` cycles; it allows up to 15 images and no videos, and the application optimizes images before upload while keeping only the optimized result.

For the self-hosted-first deployment, Supabase Storage starts with files on a persistent volume and its files are included with the database in external backups. The bucket remains private and follows vehicle read/write permissions. The application continues to use the Supabase Storage API if a future VPS deployment moves the backend to S3-compatible storage; direct application integration with another object-storage provider is not part of the initial design.

The upload optimization settings remain adjustable. We do not retain originals, so a future increase in resolution cannot restore detail already discarded from existing photos; those photos would need to be uploaded again.

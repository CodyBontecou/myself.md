# HealthKit quantity-series reader

Read-only Expo local module for the detail absent from the installed HealthKit JavaScript bridge. It shares the app's existing HealthKit entitlement and OS read authorization; it never requests or grants authorization itself.

`quantitySeries(typeIdentifier, sampleUUID, unit)` resolves exactly that readable parent, retains its original count, aggregation style, precise timestamps and discrete/cumulative properties, then reads every child with `HKQuantitySeriesSampleQueryDescriptor`. A child-count mismatch, missing parent or native error rejects the read. JavaScript preserves the original parent and marks capture partial on rejection. No values are inferred from an aggregate.

Children retain source order, duplicates, unit, date interval, fractional epoch milliseconds and owning UUID. JSON is returned as a string to preserve nested fields across the Expo boundary. Rebuild the iOS app after adding/updating this module. `npm run prebuild -- --platform ios` autolinks it; `npm run build:ios:debug` compiles the generated app. Generated native directories are not edited by hand.

/** Paid hosted-storage tiers. Each tier replaces the included Lifetime allowance and requires Lifetime access. */
/** @typedef {'cloud_1gb'|'cloud_10gb'} CloudPlanId */
/** @typedef {'monthly'|'yearly'} CloudPeriod */
/** @typedef {{id:CloudPlanId,capacityBytes:number,label:string,usPrice:Record<CloudPeriod,string>,ios:Record<CloudPeriod,string>,android:{productId:string,basePlans:Record<CloudPeriod,string>}}} CloudPlan */

/** Ordered from lowest to highest service level. @type {readonly CloudPlan[]} */
export const cloudPlans = [
  {
    id: 'cloud_1gb',
    capacityBytes: 1_000_000_000,
    label: '1 GB',
    usPrice: { monthly: '$1.99', yearly: '$19.99' },
    ios: { monthly: 'myself_md_cloud_1gb_monthly', yearly: 'myself_md_cloud_1gb_yearly' },
    android: {
      productId: 'myself_md_cloud_1gb',
      basePlans: { monthly: 'monthly', yearly: 'yearly' },
    },
  },
  {
    id: 'cloud_10gb',
    capacityBytes: 10_000_000_000,
    label: '10 GB',
    usPrice: { monthly: '$4.99', yearly: '$49.99' },
    ios: { monthly: 'myself_md_cloud_10gb_monthly', yearly: 'myself_md_cloud_10gb_yearly' },
    android: {
      productId: 'myself_md_cloud_10gb',
      basePlans: { monthly: 'monthly', yearly: 'yearly' },
    },
  },
];
/** @param {unknown} id */
export function cloudPlan(id) {
  return cloudPlans.find((plan) => plan.id === id) ?? null;
}
/** Map a store product to its tier. Android requires the base plan; iOS product IDs are period-specific.
 * @param {'ios'|'android'} store @param {string} productId @param {string} [basePlanId]
 * @returns {{plan:CloudPlan,period:CloudPeriod}|null} */
export function cloudPlanForProduct(store, productId, basePlanId) {
  for (const plan of cloudPlans)
    for (const period of /** @type {CloudPeriod[]} */ (['monthly', 'yearly'])) {
      if (store === 'ios' && plan.ios[period] === productId) return { plan, period };
      if (
        store === 'android' &&
        plan.android.productId === productId &&
        plan.android.basePlans[period] === basePlanId
      )
        return { plan, period };
    }
  return null;
}

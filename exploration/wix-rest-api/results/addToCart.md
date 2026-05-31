request: https://edge.wixapis.com/ecom/v1/carts/current/add-to-cart
method: POST
payload: 
```json
{"lineItems":[{"catalogReference":{"catalogItemId":"af654225-662f-42e5-ac51-fbebc88f63ed","appId":"215238eb-22a5-4c36-9e7b-e7c08025e04e"},"quantity":1}]}
```
response: 
```json
{
    "cart": {
        "id": "ca727402-7da0-4d66-b36a-a5b16f8158d8",
        "lineItems": [
            {
                "id": "00000000-0000-0000-0000-000000000001",
                "quantity": 1,
                "catalogReference": {
                    "catalogItemId": "af654225-662f-42e5-ac51-fbebc88f63ed",
                    "appId": "215238eb-22a5-4c36-9e7b-e7c08025e04e"
                },
                "productName": {
                    "original": "Ceramic Flower Vase",
                    "translated": "Ceramic Flower Vase"
                },
                "url": {
                    "relativePath": "/product-page/ceramic-flower-vase",
                    "url": "https://yoav68.wixstudio.com/my-site-35/product-page/ceramic-flower-vase"
                },
                "price": {
                    "amount": "270",
                    "convertedAmount": "270",
                    "formattedAmount": "270.00 ₪",
                    "formattedConvertedAmount": "270.00 ₪"
                },
                "originalPrice": "270",
                "originalFullPrice": "270",
                "fullPrice": {
                    "amount": "270",
                    "convertedAmount": "270",
                    "formattedAmount": "270.00 ₪",
                    "formattedConvertedAmount": "270.00 ₪"
                },
                "priceBeforeDiscounts": {
                    "amount": "270",
                    "convertedAmount": "270",
                    "formattedAmount": "270.00 ₪",
                    "formattedConvertedAmount": "270.00 ₪"
                },
                "lineItemPrice": {
                    "amount": "270",
                    "convertedAmount": "270",
                    "formattedAmount": "270.00 ₪",
                    "formattedConvertedAmount": "270.00 ₪"
                },
                "descriptionLines": [],
                "image": {
                    "id": "22e53e_63dba6a8f31a4de7bfb453ed3d0a83dd~mv2.jpg",
                    "url": "https://static.wixstatic.com/media/22e53e_63dba6a8f31a4de7bfb453ed3d0a83dd~mv2.jpg",
                    "height": 3000,
                    "width": 3000,
                    "filename": "Vase-Context (1).jpg"
                },
                "availability": {
                    "status": "AVAILABLE"
                },
                "physicalProperties": {
                    "sku": "364215376135191",
                    "shippable": true
                },
                "couponScopes": [
                    {
                        "namespace": "stores",
                        "group": {
                            "name": "collection",
                            "entityId": "becc814c-0375-45e8-a826-cd0391f935ef"
                        }
                    },
                    {
                        "namespace": "stores",
                        "group": {
                            "name": "collection",
                            "entityId": "bc0990ba-e6c6-450c-94cc-a0c62543eb13"
                        }
                    },
                    {
                        "namespace": "stores",
                        "group": {
                            "name": "product",
                            "entityId": "af654225-662f-42e5-ac51-fbebc88f63ed"
                        }
                    }
                ],
                "itemType": {
                    "preset": "PHYSICAL"
                },
                "paymentOption": "FULL_PAYMENT_ONLINE",
                "rootCatalogItemId": "af654225-662f-42e5-ac51-fbebc88f63ed",
                "customLineItem": false,
                "priceUndetermined": false,
                "fixedQuantity": false,
                "savePaymentMethod": false,
                "taxableAddress": {
                    "addressType": "SHIPPING"
                },
                "policies": [],
                "inventoryAppId": "215238eb-22a5-4c36-9e7b-e7c08025e04e",
                "membersOnly": false,
                "modifierGroups": [],
                "modifiersTotalPrice": {
                    "amount": "0",
                    "convertedAmount": "0",
                    "formattedAmount": "0.00 ₪",
                    "formattedConvertedAmount": "0.00 ₪"
                }
            }
        ],
        "buyerInfo": {
            "visitorId": "51c82954-951f-4c2b-a0b0-a023a3b1507d"
        },
        "currency": "ILS",
        "conversionCurrency": "ILS",
        "buyerLanguage": "en",
        "siteLanguage": "en",
        "taxIncludedInPrices": false,
        "weightUnit": "KG",
        "subtotal": {
            "amount": "270",
            "convertedAmount": "270",
            "formattedAmount": "270.00 ₪",
            "formattedConvertedAmount": "270.00 ₪"
        },
        "subtotalAfterDiscounts": {
            "amount": "270",
            "convertedAmount": "270",
            "formattedAmount": "270.00 ₪",
            "formattedConvertedAmount": "270.00 ₪"
        },
        "discount": {
            "amount": "0",
            "convertedAmount": "0",
            "formattedAmount": "0.00 ₪",
            "formattedConvertedAmount": "0.00 ₪"
        },
        "checkoutId": "ca727402-7da0-4d66-b36a-a5b16f8158d8",
        "appliedDiscounts": [],
        "createdDate": "2026-05-31T17:21:18.316Z",
        "updatedDate": "2026-05-31T17:21:18.316Z",
        "contactInfo": {
            "address": {
                "country": "IL",
                "subdivision": "IL-TA",
                "countryFullname": "Israel"
            }
        },
        "purchaseFlowId": "a948ced3-2d0c-4d12-9ccd-38f57633dd36",
        "paymentCurrency": "ILS",
        "managedByV2": true,
        "revision": "1"
    }
}
```
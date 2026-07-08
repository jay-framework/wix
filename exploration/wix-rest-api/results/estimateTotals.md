request: https://edge.wixapis.com/ecom/v1/carts/current/estimate-totals
method: POST
payload: `{}`
response:

```json
{
  "cart": {
    "id": "ca727402-3e3c-4496-bbf6-7fdfa02aea3e",
    "lineItems": [
      {
        "id": "00000000-0000-0000-0000-000000000002",
        "quantity": 1,
        "catalogReference": {
          "catalogItemId": "29d7a2c3-2ab4-45ab-be00-e74c3b27ab59",
          "appId": "215238eb-22a5-4c36-9e7b-e7c08025e04e",
          "options": {
            "options": {},
            "variantId": "4d64ac46-3004-44ab-8ad1-7cf04a33063b",
            "customTextFields": {}
          }
        },
        "productName": {
          "original": "סט מצעי כותנה ג'ון",
          "translated": "סט מצעי כותנה ג'ון"
        },
        "url": {
          "relativePath": "/product-page/8169106",
          "url": "/product-page/8169106"
        },
        "price": {
          "amount": "98",
          "convertedAmount": "98",
          "formattedAmount": "₪98.00",
          "formattedConvertedAmount": "₪98.00"
        },
        "originalPrice": "98",
        "originalFullPrice": "109",
        "fullPrice": {
          "amount": "109",
          "convertedAmount": "109",
          "formattedAmount": "₪109.00",
          "formattedConvertedAmount": "₪109.00"
        },
        "priceBeforeDiscounts": {
          "amount": "98",
          "convertedAmount": "98",
          "formattedAmount": "₪98.00",
          "formattedConvertedAmount": "₪98.00"
        },
        "lineItemPrice": {
          "amount": "98",
          "convertedAmount": "98",
          "formattedAmount": "₪98.00",
          "formattedConvertedAmount": "₪98.00"
        },
        "descriptionLines": [
          {
            "name": {
              "original": "צבע",
              "translated": "צבע"
            },
            "colorInfo": {
              "original": "תכלת",
              "translated": "תכלת",
              "code": "#0000FF"
            },
            "lineType": "COLOR",
            "color": "#0000FF",
            "modifierDescriptionLine": false
          },
          {
            "name": {
              "original": "מידה",
              "translated": "מידה"
            },
            "plainText": {
              "original": "סט זוגי חלקי 160X200",
              "translated": "סט זוגי חלקי 160X200"
            },
            "lineType": "UNRECOGNISED",
            "modifierDescriptionLine": false
          }
        ],
        "image": {
          "id": "5da3cc_2066cd4663a14554a94dfe2187d5b13c~mv2.jpg",
          "url": "https://static.wixstatic.com/media/5da3cc_2066cd4663a14554a94dfe2187d5b13c~mv2.jpg",
          "height": 1200,
          "width": 900,
          "filename": "8169106_117_a.jpg"
        },
        "availability": {
          "status": "AVAILABLE",
          "quantityAvailable": 15
        },
        "physicalProperties": {
          "sku": "81691091700",
          "shippable": true
        },
        "couponScopes": [
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "5679765e-68a5-4196-9e80-751fdff147f9"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "1ae12908-552b-445b-a06f-ea847d247953"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "ba7de44a-38b9-4695-86fc-899fc936c713"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "bf166df2-c18c-440a-8dd2-fcf07101b8aa"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "fd7d8823-3d84-4a0a-a609-f970d7dcf3d6"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "eac4db24-04cc-4f36-86cf-c9da6e873421"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "88c521cc-049d-4375-8ad7-3c0c17670cf1"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "de14f13d-df59-4287-943d-37cc18a74411"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "667092cb-21ed-4169-b9b8-3e62ab2cecdc"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "145377bf-b808-4f80-963e-854ff4eb816b"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "6f3108ba-1813-4d9e-970b-ea52fe2ae281"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "ce6d82b7-7ab1-41e1-98d9-2036d7f5050a"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "46d27bda-5900-432d-a598-681b7570464c"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "2b468f47-6aa8-41a5-b3d7-fd177656a014"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "product",
              "entityId": "29d7a2c3-2ab4-45ab-be00-e74c3b27ab59"
            }
          }
        ],
        "itemType": {
          "preset": "PHYSICAL"
        },
        "paymentOption": "FULL_PAYMENT_ONLINE",
        "rootCatalogItemId": "29d7a2c3-2ab4-45ab-be00-e74c3b27ab59",
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
          "formattedAmount": "₪0.00",
          "formattedConvertedAmount": "₪0.00"
        }
      },
      {
        "id": "00000000-0000-0000-0000-000000000003",
        "quantity": 1,
        "catalogReference": {
          "catalogItemId": "11ef650a-41b9-4b2b-ae12-9e69bbe89b1b",
          "appId": "215238eb-22a5-4c36-9e7b-e7c08025e04e",
          "options": {
            "options": {},
            "variantId": "e03eebfa-4a57-4068-949c-05f7b9581019",
            "customTextFields": {}
          }
        },
        "productName": {
          "original": "MAX MORETTI מכופתרת NON IRON פשתן בגזרת רגולר פיט",
          "translated": "MAX MORETTI מכופתרת NON IRON פשתן בגזרת רגולר פיט"
        },
        "url": {
          "relativePath": "/product-page/3338114",
          "url": "/product-page/3338114"
        },
        "price": {
          "amount": "399.9",
          "convertedAmount": "399.9",
          "formattedAmount": "₪399.90",
          "formattedConvertedAmount": "₪399.90"
        },
        "originalPrice": "399.9",
        "originalFullPrice": "399.9",
        "fullPrice": {
          "amount": "399.9",
          "convertedAmount": "399.9",
          "formattedAmount": "₪399.90",
          "formattedConvertedAmount": "₪399.90"
        },
        "priceBeforeDiscounts": {
          "amount": "399.9",
          "convertedAmount": "399.9",
          "formattedAmount": "₪399.90",
          "formattedConvertedAmount": "₪399.90"
        },
        "lineItemPrice": {
          "amount": "399.9",
          "convertedAmount": "399.9",
          "formattedAmount": "₪399.90",
          "formattedConvertedAmount": "₪399.90"
        },
        "descriptionLines": [
          {
            "name": {
              "original": "צבע",
              "translated": "צבע"
            },
            "colorInfo": {
              "original": "כחול",
              "translated": "כחול",
              "code": "#0000FF"
            },
            "lineType": "COLOR",
            "color": "#0000FF",
            "modifierDescriptionLine": false
          },
          {
            "name": {
              "original": "מידה",
              "translated": "מידה"
            },
            "plainText": {
              "original": "S",
              "translated": "S"
            },
            "lineType": "UNRECOGNISED",
            "modifierDescriptionLine": false
          }
        ],
        "image": {
          "id": "cc336a_ed31a4e690d54e5c8b676b45cdccdb5f~mv2.jpg",
          "url": "https://static.wixstatic.com/media/cc336a_ed31a4e690d54e5c8b676b45cdccdb5f~mv2.jpg",
          "height": 2000,
          "width": 1500,
          "filename": "3338114_103_b.jpg"
        },
        "availability": {
          "status": "AVAILABLE",
          "quantityAvailable": 9
        },
        "physicalProperties": {
          "sku": "33381140338",
          "shippable": true
        },
        "couponScopes": [
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "024a9fff-77de-4508-b82c-5fce24f74757"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "dae04d55-80fb-49cb-86ae-98dae0952cd0"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "fb747acd-874c-4d02-85e6-f81d062a45a2"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "4e8c63c0-126b-4e82-bf94-64b70ee2c2c0"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "2a5194c1-5cac-446a-98f8-faf76124f5f5"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "a6df322f-2a36-46c6-8b95-ebe4dcaed32f"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "eb6612b8-3c92-4b05-8e0f-a328c7348c35"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "b72c6cc5-46f0-4e3e-8cb7-85a4c15f8ab5"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "3b6a230f-c743-402c-aeb6-5b909bdce4b0"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "c43beed4-2f3e-41a2-adb3-bc8b0db237f1"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "d8e2d2f5-5f69-4d96-8a58-bf5769ef77c9"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "7eea1d1d-b96a-42f5-a49f-89aa8c196b5f"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "98304d78-1824-4637-adfb-7b86a65d5e25"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "1c7350fd-64fc-4959-a902-8ab9da5e613d"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "c773cb5f-6b16-4d5d-80ca-69606fd0b68c"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "76e401c1-8a27-46e9-8f2e-4fe2af5902a9"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "2af5b5d0-2eec-419d-92b0-b061f4b3d5b0"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "fde393ed-541d-4841-b81a-8892f4e776e7"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "661bb786-4e8b-4da2-affc-4d1847a898d1"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "b1969df5-e4c2-42f2-839a-f7960edb8c0b"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "2aee50bf-8ffc-45c5-9b51-30dde3d8086e"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "2b468f47-6aa8-41a5-b3d7-fd177656a014"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "f8e79341-a264-4357-b63b-eb8cd73dfa5e"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "product",
              "entityId": "11ef650a-41b9-4b2b-ae12-9e69bbe89b1b"
            }
          }
        ],
        "itemType": {
          "preset": "PHYSICAL"
        },
        "paymentOption": "FULL_PAYMENT_ONLINE",
        "rootCatalogItemId": "11ef650a-41b9-4b2b-ae12-9e69bbe89b1b",
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
          "formattedAmount": "₪0.00",
          "formattedConvertedAmount": "₪0.00"
        }
      },
      {
        "id": "00000000-0000-0000-0000-000000000005",
        "quantity": 1,
        "catalogReference": {
          "catalogItemId": "0ec0a19d-afbf-45aa-a2ba-d00157301319",
          "appId": "215238eb-22a5-4c36-9e7b-e7c08025e04e",
          "options": {
            "options": {},
            "variantId": "c8d2334d-6dc7-4604-b00b-ac45469ebeff",
            "customTextFields": {}
          }
        },
        "productName": {
          "original": "MAX MORETTI חולצת פולו פיקה וופל",
          "translated": "MAX MORETTI חולצת פולו פיקה וופל"
        },
        "url": {
          "relativePath": "/product-page/3338306",
          "url": "/product-page/3338306"
        },
        "price": {
          "amount": "269.9",
          "convertedAmount": "269.9",
          "formattedAmount": "₪269.90",
          "formattedConvertedAmount": "₪269.90"
        },
        "originalPrice": "269.9",
        "originalFullPrice": "269.9",
        "fullPrice": {
          "amount": "269.9",
          "convertedAmount": "269.9",
          "formattedAmount": "₪269.90",
          "formattedConvertedAmount": "₪269.90"
        },
        "priceBeforeDiscounts": {
          "amount": "269.9",
          "convertedAmount": "269.9",
          "formattedAmount": "₪269.90",
          "formattedConvertedAmount": "₪269.90"
        },
        "lineItemPrice": {
          "amount": "269.9",
          "convertedAmount": "269.9",
          "formattedAmount": "₪269.90",
          "formattedConvertedAmount": "₪269.90"
        },
        "descriptionLines": [
          {
            "name": {
              "original": "צבע",
              "translated": "צבע"
            },
            "colorInfo": {
              "original": "חול",
              "translated": "חול",
              "code": "#F0F0F0"
            },
            "lineType": "COLOR",
            "color": "#F0F0F0",
            "modifierDescriptionLine": false
          },
          {
            "name": {
              "original": "מידה",
              "translated": "מידה"
            },
            "plainText": {
              "original": "S",
              "translated": "S"
            },
            "lineType": "UNRECOGNISED",
            "modifierDescriptionLine": false
          }
        ],
        "image": {
          "id": "cc336a_4c491928259445a8a39baba1946f114d~mv2.jpg",
          "url": "https://static.wixstatic.com/media/cc336a_4c491928259445a8a39baba1946f114d~mv2.jpg",
          "height": 2000,
          "width": 1500,
          "filename": "3338306_146_d.jpg"
        },
        "availability": {
          "status": "AVAILABLE",
          "quantityAvailable": 20
        },
        "physicalProperties": {
          "sku": "33383064638",
          "shippable": true
        },
        "couponScopes": [
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "024a9fff-77de-4508-b82c-5fce24f74757"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "dae04d55-80fb-49cb-86ae-98dae0952cd0"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "2a5194c1-5cac-446a-98f8-faf76124f5f5"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "fb747acd-874c-4d02-85e6-f81d062a45a2"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "5db2466c-81fa-472f-9922-38a52e3d78ca"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "d8e2d2f5-5f69-4d96-8a58-bf5769ef77c9"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "7eea1d1d-b96a-42f5-a49f-89aa8c196b5f"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "c773cb5f-6b16-4d5d-80ca-69606fd0b68c"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "1c7350fd-64fc-4959-a902-8ab9da5e613d"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "7e274d77-553e-4c91-8a35-e53d7293e58a"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "2af5b5d0-2eec-419d-92b0-b061f4b3d5b0"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "e41b4b48-2880-4286-8d66-3981331e6715"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "7f186944-0f73-4e48-87f8-588a47eba5a1"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "2b468f47-6aa8-41a5-b3d7-fd177656a014"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "2aee50bf-8ffc-45c5-9b51-30dde3d8086e"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "9b6656f8-1a9e-4c90-bf4f-c73b63adea2c"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "product",
              "entityId": "0ec0a19d-afbf-45aa-a2ba-d00157301319"
            }
          }
        ],
        "itemType": {
          "preset": "PHYSICAL"
        },
        "paymentOption": "FULL_PAYMENT_ONLINE",
        "rootCatalogItemId": "0ec0a19d-afbf-45aa-a2ba-d00157301319",
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
          "formattedAmount": "₪0.00",
          "formattedConvertedAmount": "₪0.00"
        }
      },
      {
        "id": "00000000-0000-0000-0000-000000000006",
        "quantity": 1,
        "catalogReference": {
          "catalogItemId": "ae0d4b47-ee97-4fb8-a68c-f922a0a28c8c",
          "appId": "215238eb-22a5-4c36-9e7b-e7c08025e04e",
          "options": {
            "options": {},
            "variantId": "96c84419-0da0-4b45-b379-2e34fbe2ca8d",
            "customTextFields": {}
          }
        },
        "productName": {
          "original": "HECHTER PARIS ג'קט חליפה תערובת פשתן בגזרת מודרן פיט",
          "translated": "HECHTER PARIS ג'קט חליפה תערובת פשתן בגזרת מודרן פיט"
        },
        "url": {
          "relativePath": "/product-page/3338903",
          "url": "/product-page/3338903"
        },
        "price": {
          "amount": "799.9",
          "convertedAmount": "799.9",
          "formattedAmount": "₪799.90",
          "formattedConvertedAmount": "₪799.90"
        },
        "originalPrice": "799.9",
        "originalFullPrice": "799.9",
        "fullPrice": {
          "amount": "799.9",
          "convertedAmount": "799.9",
          "formattedAmount": "₪799.90",
          "formattedConvertedAmount": "₪799.90"
        },
        "priceBeforeDiscounts": {
          "amount": "799.9",
          "convertedAmount": "799.9",
          "formattedAmount": "₪799.90",
          "formattedConvertedAmount": "₪799.90"
        },
        "lineItemPrice": {
          "amount": "799.9",
          "convertedAmount": "799.9",
          "formattedAmount": "₪799.90",
          "formattedConvertedAmount": "₪799.90"
        },
        "descriptionLines": [
          {
            "name": {
              "original": "צבע",
              "translated": "צבע"
            },
            "colorInfo": {
              "original": "ירוק",
              "translated": "ירוק",
              "code": "#800080"
            },
            "lineType": "COLOR",
            "color": "#800080",
            "modifierDescriptionLine": false
          },
          {
            "name": {
              "original": "מידה",
              "translated": "מידה"
            },
            "plainText": {
              "original": "48",
              "translated": "48"
            },
            "lineType": "UNRECOGNISED",
            "modifierDescriptionLine": false
          }
        ],
        "image": {
          "id": "cc336a_2af07c9bf6904cd08ce0c9369e61c768~mv2.jpg",
          "url": "https://static.wixstatic.com/media/cc336a_2af07c9bf6904cd08ce0c9369e61c768~mv2.jpg",
          "height": 2000,
          "width": 1500,
          "filename": "3338903_106_a.jpg"
        },
        "availability": {
          "status": "AVAILABLE",
          "quantityAvailable": 11
        },
        "physicalProperties": {
          "sku": "33389030648",
          "shippable": true
        },
        "couponScopes": [
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "024a9fff-77de-4508-b82c-5fce24f74757"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "c773cb5f-6b16-4d5d-80ca-69606fd0b68c"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "2a5194c1-5cac-446a-98f8-faf76124f5f5"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "fb747acd-874c-4d02-85e6-f81d062a45a2"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "1d1e9511-79c0-4a2c-a9d4-8d32224f1e8d"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "d8e2d2f5-5f69-4d96-8a58-bf5769ef77c9"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "7eea1d1d-b96a-42f5-a49f-89aa8c196b5f"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "a6df322f-2a36-46c6-8b95-ebe4dcaed32f"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "2ec029de-4f36-4c74-af51-b827413230e4"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "98304d78-1824-4637-adfb-7b86a65d5e25"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "790655b1-4fd4-4b3c-bed6-10e953bf91ff"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "e41b4b48-2880-4286-8d66-3981331e6715"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "9b6656f8-1a9e-4c90-bf4f-c73b63adea2c"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "2af5b5d0-2eec-419d-92b0-b061f4b3d5b0"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "3d7b501f-7b3d-4893-a283-6240acd0d9a6"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "2aee50bf-8ffc-45c5-9b51-30dde3d8086e"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "5a20b873-f9af-4407-8153-51785705d31b"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "f8e79341-a264-4357-b63b-eb8cd73dfa5e"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "7fff3e23-fc0c-44cf-97e5-2e165cd3dab2"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "2b468f47-6aa8-41a5-b3d7-fd177656a014"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "1c7350fd-64fc-4959-a902-8ab9da5e613d"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "45c2b715-d501-41c3-841e-4a523a2c57f1"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "product",
              "entityId": "ae0d4b47-ee97-4fb8-a68c-f922a0a28c8c"
            }
          }
        ],
        "itemType": {
          "preset": "PHYSICAL"
        },
        "paymentOption": "FULL_PAYMENT_ONLINE",
        "rootCatalogItemId": "ae0d4b47-ee97-4fb8-a68c-f922a0a28c8c",
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
          "formattedAmount": "₪0.00",
          "formattedConvertedAmount": "₪0.00"
        }
      },
      {
        "id": "00000000-0000-0000-0000-000000000007",
        "quantity": 1,
        "catalogReference": {
          "catalogItemId": "a4b2b4d6-5fb3-4e6f-95e3-7b398d2533b0",
          "appId": "215238eb-22a5-4c36-9e7b-e7c08025e04e",
          "options": {
            "options": {},
            "variantId": "bc8a8c69-5061-4599-8eeb-4fb3f175d4e1",
            "customTextFields": {}
          }
        },
        "productName": {
          "original": "סט מצעי כותנה פלנל ברק",
          "translated": "סט מצעי כותנה פלנל ברק"
        },
        "url": {
          "relativePath": "/product-page/4868905",
          "url": "/product-page/4868905"
        },
        "price": {
          "amount": "104.9",
          "convertedAmount": "104.9",
          "formattedAmount": "₪104.90",
          "formattedConvertedAmount": "₪104.90"
        },
        "originalPrice": "104.9",
        "originalFullPrice": "104.9",
        "fullPrice": {
          "amount": "104.9",
          "convertedAmount": "104.9",
          "formattedAmount": "₪104.90",
          "formattedConvertedAmount": "₪104.90"
        },
        "priceBeforeDiscounts": {
          "amount": "104.9",
          "convertedAmount": "104.9",
          "formattedAmount": "₪104.90",
          "formattedConvertedAmount": "₪104.90"
        },
        "lineItemPrice": {
          "amount": "104.9",
          "convertedAmount": "104.9",
          "formattedAmount": "₪104.90",
          "formattedConvertedAmount": "₪104.90"
        },
        "descriptionLines": [
          {
            "name": {
              "original": "צבע",
              "translated": "צבע"
            },
            "colorInfo": {
              "original": "אוף וויט",
              "translated": "אוף וויט",
              "code": "#FFFFFF"
            },
            "lineType": "COLOR",
            "color": "#FFFFFF",
            "modifierDescriptionLine": false
          },
          {
            "name": {
              "original": "מידה",
              "translated": "מידה"
            },
            "plainText": {
              "original": "סט יחיד 90X200",
              "translated": "סט יחיד 90X200"
            },
            "lineType": "UNRECOGNISED",
            "modifierDescriptionLine": false
          }
        ],
        "image": {
          "id": "a806fd_14dc611a2f5947d1a4d2f80b009871fb~mv2.jpg",
          "url": "https://static.wixstatic.com/media/a806fd_14dc611a2f5947d1a4d2f80b009871fb~mv2.jpg",
          "height": 1200,
          "width": 900,
          "filename": "4868905_162_a.jpg"
        },
        "availability": {
          "status": "AVAILABLE",
          "quantityAvailable": 31
        },
        "physicalProperties": {
          "sku": "48689056200",
          "shippable": true
        },
        "couponScopes": [
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "eac4db24-04cc-4f36-86cf-c9da6e873421"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "88c521cc-049d-4375-8ad7-3c0c17670cf1"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "fb90c8cd-b48e-40f8-8cd3-3918f127be96"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "df1c1798-022c-41e1-8ebb-eef9aa744e4a"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "20ee8ba0-235d-4605-aaf3-b74619d2f9f8"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "5679765e-68a5-4196-9e80-751fdff147f9"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "1ae12908-552b-445b-a06f-ea847d247953"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "fd7d8823-3d84-4a0a-a609-f970d7dcf3d6"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "bf166df2-c18c-440a-8dd2-fcf07101b8aa"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "e9b28269-7fbd-4e55-9504-a7647e938c27"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "df5d8fe3-da09-4cda-9cbe-466617730c8f"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "49ed2a61-2abe-4b75-af7d-5a99cc2e676f"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "145377bf-b808-4f80-963e-854ff4eb816b"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "c8bbcf46-3206-4ce1-83b0-f795f53a5562"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "9dd122e3-2987-4e9e-a124-748691e6d3ee"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "db22e60b-cfd5-4830-8d77-477027b6c767"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "6f3108ba-1813-4d9e-970b-ea52fe2ae281"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "2b468f47-6aa8-41a5-b3d7-fd177656a014"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "bc402d0d-4054-4551-ac03-322c567eb372"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "a8390878-ea5b-4b39-bbb7-490719bf6361"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "359b38c6-d0c9-40c1-a351-910e8d36fe85"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "c8ab9c43-e27e-4c65-b577-e81081ff8d66"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "001de78a-e707-4f05-8635-f9d0dbda0bb6"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "product",
              "entityId": "a4b2b4d6-5fb3-4e6f-95e3-7b398d2533b0"
            }
          }
        ],
        "itemType": {
          "preset": "PHYSICAL"
        },
        "paymentOption": "FULL_PAYMENT_ONLINE",
        "rootCatalogItemId": "a4b2b4d6-5fb3-4e6f-95e3-7b398d2533b0",
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
          "formattedAmount": "₪0.00",
          "formattedConvertedAmount": "₪0.00"
        }
      },
      {
        "id": "00000000-0000-0000-0000-000000000008",
        "quantity": 1,
        "catalogReference": {
          "catalogItemId": "a54661c1-5431-4264-a049-c289370bc5fd",
          "appId": "215238eb-22a5-4c36-9e7b-e7c08025e04e",
          "options": {
            "options": {},
            "variantId": "7a61be85-cbc3-4c7f-ac9a-f962fdb4bc7e",
            "customTextFields": {}
          }
        },
        "productName": {
          "original": "MAX MORETTI מכנסי צ'ינו פרומו",
          "translated": "MAX MORETTI מכנסי צ'ינו פרומו"
        },
        "url": {
          "relativePath": "/product-page/3338603",
          "url": "/product-page/3338603"
        },
        "price": {
          "amount": "299.9",
          "convertedAmount": "299.9",
          "formattedAmount": "₪299.90",
          "formattedConvertedAmount": "₪299.90"
        },
        "originalPrice": "299.9",
        "originalFullPrice": "299.9",
        "fullPrice": {
          "amount": "299.9",
          "convertedAmount": "299.9",
          "formattedAmount": "₪299.90",
          "formattedConvertedAmount": "₪299.90"
        },
        "priceBeforeDiscounts": {
          "amount": "299.9",
          "convertedAmount": "299.9",
          "formattedAmount": "₪299.90",
          "formattedConvertedAmount": "₪299.90"
        },
        "lineItemPrice": {
          "amount": "299.9",
          "convertedAmount": "299.9",
          "formattedAmount": "₪299.90",
          "formattedConvertedAmount": "₪299.90"
        },
        "descriptionLines": [
          {
            "name": {
              "original": "צבע",
              "translated": "צבע"
            },
            "colorInfo": {
              "original": "בז'",
              "translated": "בז'",
              "code": "#cfcfba"
            },
            "lineType": "COLOR",
            "color": "#cfcfba",
            "modifierDescriptionLine": false
          },
          {
            "name": {
              "original": "מידה",
              "translated": "מידה"
            },
            "plainText": {
              "original": "38",
              "translated": "38"
            },
            "lineType": "UNRECOGNISED",
            "modifierDescriptionLine": false
          }
        ],
        "image": {
          "id": "cc336a_82af4cdb83d546efaf88d4dc9a059a50~mv2.jpg",
          "url": "https://static.wixstatic.com/media/cc336a_82af4cdb83d546efaf88d4dc9a059a50~mv2.jpg",
          "height": 2000,
          "width": 1500,
          "filename": "3338603_121_b.jpg"
        },
        "availability": {
          "status": "AVAILABLE",
          "quantityAvailable": 7
        },
        "physicalProperties": {
          "sku": "33386032138",
          "shippable": true
        },
        "couponScopes": [
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "024a9fff-77de-4508-b82c-5fce24f74757"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "2a5194c1-5cac-446a-98f8-faf76124f5f5"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "fb747acd-874c-4d02-85e6-f81d062a45a2"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "53d355e0-4abd-463f-a1b3-3e102655ade3"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "a6df322f-2a36-46c6-8b95-ebe4dcaed32f"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "a1e82b53-b9ca-4534-8df3-48f0f7925b16"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "c773cb5f-6b16-4d5d-80ca-69606fd0b68c"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "adbc4233-e804-446a-b319-c10ec7d25f01"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "d8e2d2f5-5f69-4d96-8a58-bf5769ef77c9"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "7eea1d1d-b96a-42f5-a49f-89aa8c196b5f"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "98304d78-1824-4637-adfb-7b86a65d5e25"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "790655b1-4fd4-4b3c-bed6-10e953bf91ff"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "534643e4-ea00-4233-abb1-ca740d797849"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "2af5b5d0-2eec-419d-92b0-b061f4b3d5b0"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "0c03791d-7b01-4922-b14d-4f0317aed823"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "3485482e-4310-4d09-a293-5f6b29db93b0"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "2b468f47-6aa8-41a5-b3d7-fd177656a014"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "9b6656f8-1a9e-4c90-bf4f-c73b63adea2c"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "1c7350fd-64fc-4959-a902-8ab9da5e613d"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "8f13c3ae-4170-41bd-8953-11be83fc301f"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "2aee50bf-8ffc-45c5-9b51-30dde3d8086e"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "f8e79341-a264-4357-b63b-eb8cd73dfa5e"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "7fff3e23-fc0c-44cf-97e5-2e165cd3dab2"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "product",
              "entityId": "a54661c1-5431-4264-a049-c289370bc5fd"
            }
          }
        ],
        "itemType": {
          "preset": "PHYSICAL"
        },
        "paymentOption": "FULL_PAYMENT_ONLINE",
        "rootCatalogItemId": "a54661c1-5431-4264-a049-c289370bc5fd",
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
          "formattedAmount": "₪0.00",
          "formattedConvertedAmount": "₪0.00"
        }
      },
      {
        "id": "00000000-0000-0000-0000-000000000009",
        "quantity": 2,
        "catalogReference": {
          "catalogItemId": "ae0d4b47-ee97-4fb8-a68c-f922a0a28c8c",
          "appId": "215238eb-22a5-4c36-9e7b-e7c08025e04e",
          "options": {
            "options": {},
            "variantId": "d191d649-f34d-4eba-a664-0c277ca832ad",
            "customTextFields": {}
          }
        },
        "productName": {
          "original": "HECHTER PARIS ג'קט חליפה תערובת פשתן בגזרת מודרן פיט",
          "translated": "HECHTER PARIS ג'קט חליפה תערובת פשתן בגזרת מודרן פיט"
        },
        "url": {
          "relativePath": "/product-page/3338903",
          "url": "/product-page/3338903"
        },
        "price": {
          "amount": "799.9",
          "convertedAmount": "799.9",
          "formattedAmount": "₪799.90",
          "formattedConvertedAmount": "₪799.90"
        },
        "originalPrice": "799.9",
        "originalFullPrice": "799.9",
        "fullPrice": {
          "amount": "799.9",
          "convertedAmount": "799.9",
          "formattedAmount": "₪799.90",
          "formattedConvertedAmount": "₪799.90"
        },
        "priceBeforeDiscounts": {
          "amount": "799.9",
          "convertedAmount": "799.9",
          "formattedAmount": "₪799.90",
          "formattedConvertedAmount": "₪799.90"
        },
        "lineItemPrice": {
          "amount": "1599.8",
          "convertedAmount": "1599.8",
          "formattedAmount": "₪1,599.80",
          "formattedConvertedAmount": "₪1,599.80"
        },
        "descriptionLines": [
          {
            "name": {
              "original": "צבע",
              "translated": "צבע"
            },
            "colorInfo": {
              "original": "ירוק",
              "translated": "ירוק",
              "code": "#800080"
            },
            "lineType": "COLOR",
            "color": "#800080",
            "modifierDescriptionLine": false
          },
          {
            "name": {
              "original": "מידה",
              "translated": "מידה"
            },
            "plainText": {
              "original": "50",
              "translated": "50"
            },
            "lineType": "UNRECOGNISED",
            "modifierDescriptionLine": false
          }
        ],
        "image": {
          "id": "cc336a_2af07c9bf6904cd08ce0c9369e61c768~mv2.jpg",
          "url": "https://static.wixstatic.com/media/cc336a_2af07c9bf6904cd08ce0c9369e61c768~mv2.jpg",
          "height": 2000,
          "width": 1500,
          "filename": "3338903_106_a.jpg"
        },
        "availability": {
          "status": "AVAILABLE",
          "quantityAvailable": 24
        },
        "physicalProperties": {
          "sku": "33389030650",
          "shippable": true
        },
        "couponScopes": [
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "024a9fff-77de-4508-b82c-5fce24f74757"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "c773cb5f-6b16-4d5d-80ca-69606fd0b68c"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "2a5194c1-5cac-446a-98f8-faf76124f5f5"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "fb747acd-874c-4d02-85e6-f81d062a45a2"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "1d1e9511-79c0-4a2c-a9d4-8d32224f1e8d"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "d8e2d2f5-5f69-4d96-8a58-bf5769ef77c9"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "7eea1d1d-b96a-42f5-a49f-89aa8c196b5f"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "a6df322f-2a36-46c6-8b95-ebe4dcaed32f"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "2ec029de-4f36-4c74-af51-b827413230e4"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "98304d78-1824-4637-adfb-7b86a65d5e25"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "790655b1-4fd4-4b3c-bed6-10e953bf91ff"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "e41b4b48-2880-4286-8d66-3981331e6715"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "9b6656f8-1a9e-4c90-bf4f-c73b63adea2c"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "2af5b5d0-2eec-419d-92b0-b061f4b3d5b0"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "3d7b501f-7b3d-4893-a283-6240acd0d9a6"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "2aee50bf-8ffc-45c5-9b51-30dde3d8086e"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "5a20b873-f9af-4407-8153-51785705d31b"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "f8e79341-a264-4357-b63b-eb8cd73dfa5e"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "7fff3e23-fc0c-44cf-97e5-2e165cd3dab2"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "2b468f47-6aa8-41a5-b3d7-fd177656a014"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "1c7350fd-64fc-4959-a902-8ab9da5e613d"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "collection",
              "entityId": "45c2b715-d501-41c3-841e-4a523a2c57f1"
            }
          },
          {
            "namespace": "stores",
            "group": {
              "name": "product",
              "entityId": "ae0d4b47-ee97-4fb8-a68c-f922a0a28c8c"
            }
          }
        ],
        "itemType": {
          "preset": "PHYSICAL"
        },
        "paymentOption": "FULL_PAYMENT_ONLINE",
        "rootCatalogItemId": "ae0d4b47-ee97-4fb8-a68c-f922a0a28c8c",
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
          "formattedAmount": "₪0.00",
          "formattedConvertedAmount": "₪0.00"
        }
      }
    ],
    "buyerInfo": {
      "visitorId": "0c323dee-2f56-438d-b7ff-0cda1bbf32e4"
    },
    "currency": "ILS",
    "conversionCurrency": "ILS",
    "buyerLanguage": "en",
    "siteLanguage": "en",
    "taxIncludedInPrices": false,
    "weightUnit": "KG",
    "subtotal": {
      "amount": "3572.3",
      "convertedAmount": "3572.3",
      "formattedAmount": "₪3,572.30",
      "formattedConvertedAmount": "₪3,572.30"
    },
    "subtotalAfterDiscounts": {
      "amount": "3572.3",
      "convertedAmount": "3572.3",
      "formattedAmount": "₪3,572.30",
      "formattedConvertedAmount": "₪3,572.30"
    },
    "discount": {
      "amount": "0",
      "convertedAmount": "0",
      "formattedAmount": "₪0.00",
      "formattedConvertedAmount": "₪0.00"
    },
    "checkoutId": "ca727402-3e3c-4496-bbf6-7fdfa02aea3e",
    "appliedDiscounts": [],
    "createdDate": "2026-04-01T12:04:55.893Z",
    "updatedDate": "2026-05-31T17:03:20.354Z",
    "contactInfo": {
      "address": {
        "country": "IL",
        "subdivision": "IL-TA",
        "countryFullname": "Israel"
      }
    },
    "purchaseFlowId": "18b475fe-b02d-40b1-bcc6-36de11e71942",
    "paymentCurrency": "ILS",
    "managedByV2": true,
    "revision": "205"
  },
  "calculatedLineItems": [
    {
      "lineItemId": "00000000-0000-0000-0000-000000000002",
      "pricesBreakdown": {
        "totalPriceAfterTax": {
          "amount": "98.00",
          "convertedAmount": "98.00",
          "formattedAmount": "₪98.00",
          "formattedConvertedAmount": "₪98.00"
        },
        "totalPriceBeforeTax": {
          "amount": "98.00",
          "convertedAmount": "98.00",
          "formattedAmount": "₪98.00",
          "formattedConvertedAmount": "₪98.00"
        },
        "taxDetails": {
          "taxableAmount": {
            "amount": "98",
            "convertedAmount": "98.00",
            "formattedAmount": "₪98.00",
            "formattedConvertedAmount": "₪98.00"
          },
          "taxRate": "0",
          "totalTax": {
            "amount": "0",
            "convertedAmount": "0",
            "formattedAmount": "₪0.00",
            "formattedConvertedAmount": "₪0.00"
          },
          "rateBreakdown": [],
          "exemptAmount": {
            "amount": "0",
            "convertedAmount": "0",
            "formattedAmount": "₪0.00",
            "formattedConvertedAmount": "₪0.00"
          },
          "taxBreakdown": []
        },
        "totalDiscount": {
          "amount": "0.00",
          "convertedAmount": "0.00",
          "formattedAmount": "₪0.00",
          "formattedConvertedAmount": "₪0.00"
        },
        "price": {
          "amount": "98.00",
          "convertedAmount": "98.00",
          "formattedAmount": "₪98.00",
          "formattedConvertedAmount": "₪98.00"
        },
        "priceBeforeDiscounts": {
          "amount": "98.00",
          "convertedAmount": "98.00",
          "formattedAmount": "₪98.00",
          "formattedConvertedAmount": "₪98.00"
        },
        "lineItemPrice": {
          "amount": "98.00",
          "convertedAmount": "98.00",
          "formattedAmount": "₪98.00",
          "formattedConvertedAmount": "₪98.00"
        },
        "fullPrice": {
          "amount": "109.00",
          "convertedAmount": "109.00",
          "formattedAmount": "₪109.00",
          "formattedConvertedAmount": "₪109.00"
        },
        "modifiers": {
          "amount": "0.00",
          "convertedAmount": "0.00",
          "formattedAmount": "₪0.00",
          "formattedConvertedAmount": "₪0.00"
        },
        "priceBeforeDiscountsAndTax": {
          "amount": "98.00",
          "convertedAmount": "98.00",
          "formattedAmount": "₪98.00",
          "formattedConvertedAmount": "₪98.00"
        },
        "depositAmount": {
          "amount": "0.00",
          "convertedAmount": "0.00",
          "formattedAmount": "₪0.00",
          "formattedConvertedAmount": "₪0.00"
        }
      },
      "paymentOption": "FULL_PAYMENT_ONLINE",
      "taxableAddress": {
        "addressType": "SHIPPING"
      },
      "modifiers": []
    },
    {
      "lineItemId": "00000000-0000-0000-0000-000000000003",
      "pricesBreakdown": {
        "totalPriceAfterTax": {
          "amount": "399.90",
          "convertedAmount": "399.90",
          "formattedAmount": "₪399.90",
          "formattedConvertedAmount": "₪399.90"
        },
        "totalPriceBeforeTax": {
          "amount": "399.90",
          "convertedAmount": "399.90",
          "formattedAmount": "₪399.90",
          "formattedConvertedAmount": "₪399.90"
        },
        "taxDetails": {
          "taxableAmount": {
            "amount": "399.9",
            "convertedAmount": "399.90",
            "formattedAmount": "₪399.90",
            "formattedConvertedAmount": "₪399.90"
          },
          "taxRate": "0",
          "totalTax": {
            "amount": "0",
            "convertedAmount": "0",
            "formattedAmount": "₪0.00",
            "formattedConvertedAmount": "₪0.00"
          },
          "rateBreakdown": [],
          "exemptAmount": {
            "amount": "0",
            "convertedAmount": "0",
            "formattedAmount": "₪0.00",
            "formattedConvertedAmount": "₪0.00"
          },
          "taxBreakdown": []
        },
        "totalDiscount": {
          "amount": "0.00",
          "convertedAmount": "0.00",
          "formattedAmount": "₪0.00",
          "formattedConvertedAmount": "₪0.00"
        },
        "price": {
          "amount": "399.90",
          "convertedAmount": "399.90",
          "formattedAmount": "₪399.90",
          "formattedConvertedAmount": "₪399.90"
        },
        "priceBeforeDiscounts": {
          "amount": "399.90",
          "convertedAmount": "399.90",
          "formattedAmount": "₪399.90",
          "formattedConvertedAmount": "₪399.90"
        },
        "lineItemPrice": {
          "amount": "399.90",
          "convertedAmount": "399.90",
          "formattedAmount": "₪399.90",
          "formattedConvertedAmount": "₪399.90"
        },
        "fullPrice": {
          "amount": "399.90",
          "convertedAmount": "399.90",
          "formattedAmount": "₪399.90",
          "formattedConvertedAmount": "₪399.90"
        },
        "modifiers": {
          "amount": "0.00",
          "convertedAmount": "0.00",
          "formattedAmount": "₪0.00",
          "formattedConvertedAmount": "₪0.00"
        },
        "priceBeforeDiscountsAndTax": {
          "amount": "399.90",
          "convertedAmount": "399.90",
          "formattedAmount": "₪399.90",
          "formattedConvertedAmount": "₪399.90"
        },
        "depositAmount": {
          "amount": "0.00",
          "convertedAmount": "0.00",
          "formattedAmount": "₪0.00",
          "formattedConvertedAmount": "₪0.00"
        }
      },
      "paymentOption": "FULL_PAYMENT_ONLINE",
      "taxableAddress": {
        "addressType": "SHIPPING"
      },
      "modifiers": []
    },
    {
      "lineItemId": "00000000-0000-0000-0000-000000000005",
      "pricesBreakdown": {
        "totalPriceAfterTax": {
          "amount": "269.90",
          "convertedAmount": "269.90",
          "formattedAmount": "₪269.90",
          "formattedConvertedAmount": "₪269.90"
        },
        "totalPriceBeforeTax": {
          "amount": "269.90",
          "convertedAmount": "269.90",
          "formattedAmount": "₪269.90",
          "formattedConvertedAmount": "₪269.90"
        },
        "taxDetails": {
          "taxableAmount": {
            "amount": "269.9",
            "convertedAmount": "269.90",
            "formattedAmount": "₪269.90",
            "formattedConvertedAmount": "₪269.90"
          },
          "taxRate": "0",
          "totalTax": {
            "amount": "0",
            "convertedAmount": "0",
            "formattedAmount": "₪0.00",
            "formattedConvertedAmount": "₪0.00"
          },
          "rateBreakdown": [],
          "exemptAmount": {
            "amount": "0",
            "convertedAmount": "0",
            "formattedAmount": "₪0.00",
            "formattedConvertedAmount": "₪0.00"
          },
          "taxBreakdown": []
        },
        "totalDiscount": {
          "amount": "0.00",
          "convertedAmount": "0.00",
          "formattedAmount": "₪0.00",
          "formattedConvertedAmount": "₪0.00"
        },
        "price": {
          "amount": "269.90",
          "convertedAmount": "269.90",
          "formattedAmount": "₪269.90",
          "formattedConvertedAmount": "₪269.90"
        },
        "priceBeforeDiscounts": {
          "amount": "269.90",
          "convertedAmount": "269.90",
          "formattedAmount": "₪269.90",
          "formattedConvertedAmount": "₪269.90"
        },
        "lineItemPrice": {
          "amount": "269.90",
          "convertedAmount": "269.90",
          "formattedAmount": "₪269.90",
          "formattedConvertedAmount": "₪269.90"
        },
        "fullPrice": {
          "amount": "269.90",
          "convertedAmount": "269.90",
          "formattedAmount": "₪269.90",
          "formattedConvertedAmount": "₪269.90"
        },
        "modifiers": {
          "amount": "0.00",
          "convertedAmount": "0.00",
          "formattedAmount": "₪0.00",
          "formattedConvertedAmount": "₪0.00"
        },
        "priceBeforeDiscountsAndTax": {
          "amount": "269.90",
          "convertedAmount": "269.90",
          "formattedAmount": "₪269.90",
          "formattedConvertedAmount": "₪269.90"
        },
        "depositAmount": {
          "amount": "0.00",
          "convertedAmount": "0.00",
          "formattedAmount": "₪0.00",
          "formattedConvertedAmount": "₪0.00"
        }
      },
      "paymentOption": "FULL_PAYMENT_ONLINE",
      "taxableAddress": {
        "addressType": "SHIPPING"
      },
      "modifiers": []
    },
    {
      "lineItemId": "00000000-0000-0000-0000-000000000006",
      "pricesBreakdown": {
        "totalPriceAfterTax": {
          "amount": "799.90",
          "convertedAmount": "799.90",
          "formattedAmount": "₪799.90",
          "formattedConvertedAmount": "₪799.90"
        },
        "totalPriceBeforeTax": {
          "amount": "799.90",
          "convertedAmount": "799.90",
          "formattedAmount": "₪799.90",
          "formattedConvertedAmount": "₪799.90"
        },
        "taxDetails": {
          "taxableAmount": {
            "amount": "799.9",
            "convertedAmount": "799.90",
            "formattedAmount": "₪799.90",
            "formattedConvertedAmount": "₪799.90"
          },
          "taxRate": "0",
          "totalTax": {
            "amount": "0",
            "convertedAmount": "0",
            "formattedAmount": "₪0.00",
            "formattedConvertedAmount": "₪0.00"
          },
          "rateBreakdown": [],
          "exemptAmount": {
            "amount": "0",
            "convertedAmount": "0",
            "formattedAmount": "₪0.00",
            "formattedConvertedAmount": "₪0.00"
          },
          "taxBreakdown": []
        },
        "totalDiscount": {
          "amount": "0.00",
          "convertedAmount": "0.00",
          "formattedAmount": "₪0.00",
          "formattedConvertedAmount": "₪0.00"
        },
        "price": {
          "amount": "799.90",
          "convertedAmount": "799.90",
          "formattedAmount": "₪799.90",
          "formattedConvertedAmount": "₪799.90"
        },
        "priceBeforeDiscounts": {
          "amount": "799.90",
          "convertedAmount": "799.90",
          "formattedAmount": "₪799.90",
          "formattedConvertedAmount": "₪799.90"
        },
        "lineItemPrice": {
          "amount": "799.90",
          "convertedAmount": "799.90",
          "formattedAmount": "₪799.90",
          "formattedConvertedAmount": "₪799.90"
        },
        "fullPrice": {
          "amount": "799.90",
          "convertedAmount": "799.90",
          "formattedAmount": "₪799.90",
          "formattedConvertedAmount": "₪799.90"
        },
        "modifiers": {
          "amount": "0.00",
          "convertedAmount": "0.00",
          "formattedAmount": "₪0.00",
          "formattedConvertedAmount": "₪0.00"
        },
        "priceBeforeDiscountsAndTax": {
          "amount": "799.90",
          "convertedAmount": "799.90",
          "formattedAmount": "₪799.90",
          "formattedConvertedAmount": "₪799.90"
        },
        "depositAmount": {
          "amount": "0.00",
          "convertedAmount": "0.00",
          "formattedAmount": "₪0.00",
          "formattedConvertedAmount": "₪0.00"
        }
      },
      "paymentOption": "FULL_PAYMENT_ONLINE",
      "taxableAddress": {
        "addressType": "SHIPPING"
      },
      "modifiers": []
    },
    {
      "lineItemId": "00000000-0000-0000-0000-000000000007",
      "pricesBreakdown": {
        "totalPriceAfterTax": {
          "amount": "104.90",
          "convertedAmount": "104.90",
          "formattedAmount": "₪104.90",
          "formattedConvertedAmount": "₪104.90"
        },
        "totalPriceBeforeTax": {
          "amount": "104.90",
          "convertedAmount": "104.90",
          "formattedAmount": "₪104.90",
          "formattedConvertedAmount": "₪104.90"
        },
        "taxDetails": {
          "taxableAmount": {
            "amount": "104.9",
            "convertedAmount": "104.90",
            "formattedAmount": "₪104.90",
            "formattedConvertedAmount": "₪104.90"
          },
          "taxRate": "0",
          "totalTax": {
            "amount": "0",
            "convertedAmount": "0",
            "formattedAmount": "₪0.00",
            "formattedConvertedAmount": "₪0.00"
          },
          "rateBreakdown": [],
          "exemptAmount": {
            "amount": "0",
            "convertedAmount": "0",
            "formattedAmount": "₪0.00",
            "formattedConvertedAmount": "₪0.00"
          },
          "taxBreakdown": []
        },
        "totalDiscount": {
          "amount": "0.00",
          "convertedAmount": "0.00",
          "formattedAmount": "₪0.00",
          "formattedConvertedAmount": "₪0.00"
        },
        "price": {
          "amount": "104.90",
          "convertedAmount": "104.90",
          "formattedAmount": "₪104.90",
          "formattedConvertedAmount": "₪104.90"
        },
        "priceBeforeDiscounts": {
          "amount": "104.90",
          "convertedAmount": "104.90",
          "formattedAmount": "₪104.90",
          "formattedConvertedAmount": "₪104.90"
        },
        "lineItemPrice": {
          "amount": "104.90",
          "convertedAmount": "104.90",
          "formattedAmount": "₪104.90",
          "formattedConvertedAmount": "₪104.90"
        },
        "fullPrice": {
          "amount": "104.90",
          "convertedAmount": "104.90",
          "formattedAmount": "₪104.90",
          "formattedConvertedAmount": "₪104.90"
        },
        "modifiers": {
          "amount": "0.00",
          "convertedAmount": "0.00",
          "formattedAmount": "₪0.00",
          "formattedConvertedAmount": "₪0.00"
        },
        "priceBeforeDiscountsAndTax": {
          "amount": "104.90",
          "convertedAmount": "104.90",
          "formattedAmount": "₪104.90",
          "formattedConvertedAmount": "₪104.90"
        },
        "depositAmount": {
          "amount": "0.00",
          "convertedAmount": "0.00",
          "formattedAmount": "₪0.00",
          "formattedConvertedAmount": "₪0.00"
        }
      },
      "paymentOption": "FULL_PAYMENT_ONLINE",
      "taxableAddress": {
        "addressType": "SHIPPING"
      },
      "modifiers": []
    },
    {
      "lineItemId": "00000000-0000-0000-0000-000000000008",
      "pricesBreakdown": {
        "totalPriceAfterTax": {
          "amount": "299.90",
          "convertedAmount": "299.90",
          "formattedAmount": "₪299.90",
          "formattedConvertedAmount": "₪299.90"
        },
        "totalPriceBeforeTax": {
          "amount": "299.90",
          "convertedAmount": "299.90",
          "formattedAmount": "₪299.90",
          "formattedConvertedAmount": "₪299.90"
        },
        "taxDetails": {
          "taxableAmount": {
            "amount": "299.9",
            "convertedAmount": "299.90",
            "formattedAmount": "₪299.90",
            "formattedConvertedAmount": "₪299.90"
          },
          "taxRate": "0",
          "totalTax": {
            "amount": "0",
            "convertedAmount": "0",
            "formattedAmount": "₪0.00",
            "formattedConvertedAmount": "₪0.00"
          },
          "rateBreakdown": [],
          "exemptAmount": {
            "amount": "0",
            "convertedAmount": "0",
            "formattedAmount": "₪0.00",
            "formattedConvertedAmount": "₪0.00"
          },
          "taxBreakdown": []
        },
        "totalDiscount": {
          "amount": "0.00",
          "convertedAmount": "0.00",
          "formattedAmount": "₪0.00",
          "formattedConvertedAmount": "₪0.00"
        },
        "price": {
          "amount": "299.90",
          "convertedAmount": "299.90",
          "formattedAmount": "₪299.90",
          "formattedConvertedAmount": "₪299.90"
        },
        "priceBeforeDiscounts": {
          "amount": "299.90",
          "convertedAmount": "299.90",
          "formattedAmount": "₪299.90",
          "formattedConvertedAmount": "₪299.90"
        },
        "lineItemPrice": {
          "amount": "299.90",
          "convertedAmount": "299.90",
          "formattedAmount": "₪299.90",
          "formattedConvertedAmount": "₪299.90"
        },
        "fullPrice": {
          "amount": "299.90",
          "convertedAmount": "299.90",
          "formattedAmount": "₪299.90",
          "formattedConvertedAmount": "₪299.90"
        },
        "modifiers": {
          "amount": "0.00",
          "convertedAmount": "0.00",
          "formattedAmount": "₪0.00",
          "formattedConvertedAmount": "₪0.00"
        },
        "priceBeforeDiscountsAndTax": {
          "amount": "299.90",
          "convertedAmount": "299.90",
          "formattedAmount": "₪299.90",
          "formattedConvertedAmount": "₪299.90"
        },
        "depositAmount": {
          "amount": "0.00",
          "convertedAmount": "0.00",
          "formattedAmount": "₪0.00",
          "formattedConvertedAmount": "₪0.00"
        }
      },
      "paymentOption": "FULL_PAYMENT_ONLINE",
      "taxableAddress": {
        "addressType": "SHIPPING"
      },
      "modifiers": []
    },
    {
      "lineItemId": "00000000-0000-0000-0000-000000000009",
      "pricesBreakdown": {
        "totalPriceAfterTax": {
          "amount": "1599.80",
          "convertedAmount": "1599.80",
          "formattedAmount": "₪1,599.80",
          "formattedConvertedAmount": "₪1,599.80"
        },
        "totalPriceBeforeTax": {
          "amount": "1599.80",
          "convertedAmount": "1599.80",
          "formattedAmount": "₪1,599.80",
          "formattedConvertedAmount": "₪1,599.80"
        },
        "taxDetails": {
          "taxableAmount": {
            "amount": "1599.8",
            "convertedAmount": "1599.80",
            "formattedAmount": "₪1,599.80",
            "formattedConvertedAmount": "₪1,599.80"
          },
          "taxRate": "0",
          "totalTax": {
            "amount": "0",
            "convertedAmount": "0",
            "formattedAmount": "₪0.00",
            "formattedConvertedAmount": "₪0.00"
          },
          "rateBreakdown": [],
          "exemptAmount": {
            "amount": "0",
            "convertedAmount": "0",
            "formattedAmount": "₪0.00",
            "formattedConvertedAmount": "₪0.00"
          },
          "taxBreakdown": []
        },
        "totalDiscount": {
          "amount": "0.00",
          "convertedAmount": "0.00",
          "formattedAmount": "₪0.00",
          "formattedConvertedAmount": "₪0.00"
        },
        "price": {
          "amount": "799.90",
          "convertedAmount": "799.90",
          "formattedAmount": "₪799.90",
          "formattedConvertedAmount": "₪799.90"
        },
        "priceBeforeDiscounts": {
          "amount": "799.90",
          "convertedAmount": "799.90",
          "formattedAmount": "₪799.90",
          "formattedConvertedAmount": "₪799.90"
        },
        "lineItemPrice": {
          "amount": "1599.80",
          "convertedAmount": "1599.80",
          "formattedAmount": "₪1,599.80",
          "formattedConvertedAmount": "₪1,599.80"
        },
        "fullPrice": {
          "amount": "799.90",
          "convertedAmount": "799.90",
          "formattedAmount": "₪799.90",
          "formattedConvertedAmount": "₪799.90"
        },
        "modifiers": {
          "amount": "0.00",
          "convertedAmount": "0.00",
          "formattedAmount": "₪0.00",
          "formattedConvertedAmount": "₪0.00"
        },
        "priceBeforeDiscountsAndTax": {
          "amount": "799.90",
          "convertedAmount": "799.90",
          "formattedAmount": "₪799.90",
          "formattedConvertedAmount": "₪799.90"
        },
        "depositAmount": {
          "amount": "0.00",
          "convertedAmount": "0.00",
          "formattedAmount": "₪0.00",
          "formattedConvertedAmount": "₪0.00"
        }
      },
      "paymentOption": "FULL_PAYMENT_ONLINE",
      "taxableAddress": {
        "addressType": "SHIPPING"
      },
      "modifiers": []
    }
  ],
  "priceSummary": {
    "subtotal": {
      "amount": "3572.30",
      "convertedAmount": "3572.30",
      "formattedAmount": "₪3,572.30",
      "formattedConvertedAmount": "₪3,572.30"
    },
    "shipping": {
      "amount": "0.00",
      "convertedAmount": "0.00",
      "formattedAmount": "₪0.00",
      "formattedConvertedAmount": "₪0.00"
    },
    "tax": {
      "amount": "0.00",
      "convertedAmount": "0.00",
      "formattedAmount": "₪0.00",
      "formattedConvertedAmount": "₪0.00"
    },
    "discount": {
      "amount": "0.00",
      "convertedAmount": "0.00",
      "formattedAmount": "₪0.00",
      "formattedConvertedAmount": "₪0.00"
    },
    "total": {
      "amount": "3572.30",
      "convertedAmount": "3572.30",
      "formattedAmount": "₪3,572.30",
      "formattedConvertedAmount": "₪3,572.30"
    },
    "additionalFees": {
      "amount": "0.00",
      "convertedAmount": "0.00",
      "formattedAmount": "₪0.00",
      "formattedConvertedAmount": "₪0.00"
    }
  },
  "taxSummary": {
    "taxableAmount": {
      "amount": "0.00",
      "convertedAmount": "0.00",
      "formattedAmount": "₪0.00",
      "formattedConvertedAmount": "₪0.00"
    },
    "totalTax": {
      "amount": "0.00",
      "convertedAmount": "0.00",
      "formattedAmount": "₪0.00",
      "formattedConvertedAmount": "₪0.00"
    },
    "manualTaxRate": "0",
    "totalExempt": {
      "amount": "0.00",
      "convertedAmount": "0.00",
      "formattedAmount": "₪0.00",
      "formattedConvertedAmount": "₪0.00"
    },
    "aggregatedTaxBreakdown": []
  },
  "shippingInfo": {
    "region": {
      "id": "8ce86b41-b6d2-4028-b4c8-d3fe9011e283",
      "name": "International"
    },
    "selectedCarrierServiceOption": {
      "code": "3e2d542e-2e4d-4a30-9386-70659197f989",
      "title": "Free shipping",
      "logistics": {
        "deliveryTime": ""
      },
      "cost": {
        "totalPriceBeforeTax": {
          "amount": "0.00",
          "convertedAmount": "0.00",
          "formattedAmount": "₪0.00",
          "formattedConvertedAmount": "₪0.00"
        },
        "price": {
          "amount": "0.00",
          "convertedAmount": "0.00",
          "formattedAmount": "₪0.00",
          "formattedConvertedAmount": "₪0.00"
        }
      },
      "requestedShippingOption": false,
      "otherCharges": [],
      "carrierId": "45c44b27-ca7b-4891-8c0d-1747d588b835",
      "deliveryAllocations": [
        {
          "deliveryCarrier": {
            "appId": "45c44b27-ca7b-4891-8c0d-1747d588b835",
            "code": "3e2d542e-2e4d-4a30-9386-70659197f989"
          },
          "deliveryRegion": {
            "id": "8ce86b41-b6d2-4028-b4c8-d3fe9011e283",
            "name": "International"
          }
        }
      ],
      "partial": false
    },
    "carrierServiceOptions": [
      {
        "carrierId": "45c44b27-ca7b-4891-8c0d-1747d588b835",
        "shippingOptions": [
          {
            "code": "3e2d542e-2e4d-4a30-9386-70659197f989",
            "title": "Free shipping",
            "logistics": {
              "deliveryTime": ""
            },
            "cost": {
              "price": {
                "amount": "0.00",
                "convertedAmount": "0.00",
                "formattedAmount": "₪0.00",
                "formattedConvertedAmount": "₪0.00"
              },
              "otherCharges": []
            },
            "deliveryAllocations": [
              {
                "deliveryCarrier": {
                  "appId": "45c44b27-ca7b-4891-8c0d-1747d588b835",
                  "code": "3e2d542e-2e4d-4a30-9386-70659197f989"
                },
                "deliveryRegion": {
                  "id": "8ce86b41-b6d2-4028-b4c8-d3fe9011e283",
                  "name": "International"
                }
              }
            ],
            "partial": false
          }
        ]
      }
    ]
  },
  "appliedDiscounts": [],
  "calculationErrors": {
    "orderValidationErrors": [],
    "giftCardCalculationErrors": []
  },
  "weightUnit": "KG",
  "currency": "ILS",
  "payNow": {
    "subtotal": {
      "amount": "3572.30",
      "convertedAmount": "3572.30",
      "formattedAmount": "₪3,572.30",
      "formattedConvertedAmount": "₪3,572.30"
    },
    "shipping": {
      "amount": "0.00",
      "convertedAmount": "0.00",
      "formattedAmount": "₪0.00",
      "formattedConvertedAmount": "₪0.00"
    },
    "tax": {
      "amount": "0.00",
      "convertedAmount": "0.00",
      "formattedAmount": "₪0.00",
      "formattedConvertedAmount": "₪0.00"
    },
    "discount": {
      "amount": "0.00",
      "convertedAmount": "0.00",
      "formattedAmount": "₪0.00",
      "formattedConvertedAmount": "₪0.00"
    },
    "total": {
      "amount": "3572.30",
      "convertedAmount": "3572.30",
      "formattedAmount": "₪3,572.30",
      "formattedConvertedAmount": "₪3,572.30"
    },
    "additionalFees": {
      "amount": "0.00",
      "convertedAmount": "0.00",
      "formattedAmount": "₪0.00",
      "formattedConvertedAmount": "₪0.00"
    }
  },
  "payLater": {
    "subtotal": {
      "amount": "0.00",
      "convertedAmount": "0.00",
      "formattedAmount": "₪0.00",
      "formattedConvertedAmount": "₪0.00"
    },
    "shipping": {
      "amount": "0.00",
      "convertedAmount": "0.00",
      "formattedAmount": "₪0.00",
      "formattedConvertedAmount": "₪0.00"
    },
    "tax": {
      "amount": "0.00",
      "convertedAmount": "0.00",
      "formattedAmount": "₪0.00",
      "formattedConvertedAmount": "₪0.00"
    },
    "discount": {
      "amount": "0.00",
      "convertedAmount": "0.00",
      "formattedAmount": "₪0.00",
      "formattedConvertedAmount": "₪0.00"
    },
    "total": {
      "amount": "0.00",
      "convertedAmount": "0.00",
      "formattedAmount": "₪0.00",
      "formattedConvertedAmount": "₪0.00"
    },
    "additionalFees": {
      "amount": "0.00",
      "convertedAmount": "0.00",
      "formattedAmount": "₪0.00",
      "formattedConvertedAmount": "₪0.00"
    }
  },
  "additionalFees": [],
  "violations": [],
  "payAfterFreeTrial": {
    "subtotal": {
      "amount": "0.00",
      "convertedAmount": "0.00",
      "formattedAmount": "₪0.00",
      "formattedConvertedAmount": "₪0.00"
    },
    "shipping": {
      "amount": "0.00",
      "convertedAmount": "0.00",
      "formattedAmount": "₪0.00",
      "formattedConvertedAmount": "₪0.00"
    },
    "tax": {
      "amount": "0.00",
      "convertedAmount": "0.00",
      "formattedAmount": "₪0.00",
      "formattedConvertedAmount": "₪0.00"
    },
    "discount": {
      "amount": "0.00",
      "convertedAmount": "0.00",
      "formattedAmount": "₪0.00",
      "formattedConvertedAmount": "₪0.00"
    },
    "total": {
      "amount": "0.00",
      "convertedAmount": "0.00",
      "formattedAmount": "₪0.00",
      "formattedConvertedAmount": "₪0.00"
    },
    "additionalFees": {
      "amount": "0.00",
      "convertedAmount": "0.00",
      "formattedAmount": "₪0.00",
      "formattedConvertedAmount": "₪0.00"
    }
  }
}
```

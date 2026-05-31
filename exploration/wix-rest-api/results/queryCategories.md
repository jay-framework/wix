request: https://edge.wixapis.com/categories/v1/categories/query
method: POST
payload: 
```json
{"treeReference":{"appNamespace":"@wix/stores"},"query":{"filter":{"visible":true},"cursorPaging":{"limit":10}}}
```
response: 
```json
{
    "categories": [
        {
            "id": "bc0990ba-e6c6-450c-94cc-a0c62543eb13",
            "revision": "1",
            "createdDate": "2026-01-18T16:02:43.118Z",
            "updatedDate": "2026-01-18T16:02:44.116Z",
            "name": "Recommended Products",
            "image": {
                "id": "11062b_ed54849c357d4407b33d9a1aa5dd0e85~mv2.jpg",
                "url": "https://static.wixstatic.com/media/11062b_ed54849c357d4407b33d9a1aa5dd0e85~mv2.jpg",
                "height": 2250,
                "width": 4000,
                "filename": "AdobeStock_530508087-[Converted].jpg",
                "sizeInBytes": "142009"
            },
            "itemCounter": 5,
            "visible": true,
            "parentCategory": {
                "index": 2
            },
            "slug": "recommended-products",
            "treeReference": {
                "appNamespace": "@wix/stores"
            }
        },
        {
            "id": "becc814c-0375-45e8-a826-cd0391f935ef",
            "revision": "2",
            "createdDate": "2025-11-16T16:20:37.969Z",
            "updatedDate": "2025-11-16T16:20:41.376Z",
            "name": "All Products",
            "image": {
                "id": "c569b3_7d0da3510f974ffd804d5ef38ea8b2a1~mv2.jpg",
                "url": "https://static.wixstatic.com/media/c569b3_7d0da3510f974ffd804d5ef38ea8b2a1~mv2.jpg",
                "height": 3652,
                "width": 5000,
                "filename": "22e53e_92b7db730eed47df94539a5ddc810fcf~mv2.jpg",
                "sizeInBytes": "3401909"
            },
            "itemCounter": 12,
            "visible": true,
            "parentCategory": {
                "index": 1
            },
            "slug": "all-products",
            "treeReference": {
                "appNamespace": "@wix/stores"
            },
            "managingAppId": "215238eb-22a5-4c36-9e7b-e7c08025e04e"
        }
    ],
    "pagingMetadata": {
        "count": 2,
        "cursors": {},
        "hasNext": false
    }
}
```
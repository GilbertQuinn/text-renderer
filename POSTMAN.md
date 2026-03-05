# Postman Testing Instructions

## Endpoint

`POST http://localhost:3000/render`

---

## Setup

1. Open Postman and click **New > HTTP Request**.
2. Set the method to **POST**.
3. Enter the URL: `http://localhost:3000/render`
4. Go to the **Headers** tab and add:
   - Key: `Content-Type`
   - Value: `application/json`

---

## Request Body

Go to the **Body** tab, select **raw**, and choose **JSON** from the dropdown. Paste the following:

```json
{
  "text": "Hello World",
  "fontUrl": "https://fonts.gstatic.com/s/roboto/v32/KFOmCnqEu92Fr1Mu4mxK.woff2",
  "color": "#000000",
  "fontSize": 48,
  "dimensions": {
    "width": 800,
    "height": 200
  },
  "format": "png"
}
```

> Replace `fontUrl` with any publicly accessible `.woff2` or `.ttf` font URL.

---

## Send & Expected Responses

Click **Send**.

### 200 OK — Success

```json
{
  "filePath": "/path/to/output/rendered-image.png"
}
```

The rendered image is saved on the server at the returned `filePath`.

### 400 Bad Request — Validation Error

Returned when a required field is missing or has an invalid value (e.g. wrong `format`, non-positive `fontSize`).

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "body must have required property 'color'"
}
```

### 422 Unprocessable Entity — Font Error

Returned when the `fontUrl` cannot be fetched or parsed.

```json
{
  "error": "Failed to resolve font from URL: ..."
}
```

### 500 Internal Server Error

Returned for unexpected rendering failures.

```json
{
  "error": "..."
}
```

---

## Required Fields Reference

| Field              | Type     | Constraints                    | Example                          |
|--------------------|----------|--------------------------------|----------------------------------|
| `text`             | string   | min length 1                   | `"Hello World"`                  |
| `fontUrl`          | string   | valid URI                      | `"https://example.com/font.ttf"` |
| `color`            | string   | min length 1 (CSS color value) | `"#000000"`                      |
| `fontSize`         | number   | greater than 0                 | `48`                             |
| `dimensions.width` | number   | greater than 0                 | `800`                            |
| `dimensions.height`| number   | greater than 0                 | `200`                            |
| `format`           | string   | `"png"` or `"jpeg"`            | `"png"`                          |

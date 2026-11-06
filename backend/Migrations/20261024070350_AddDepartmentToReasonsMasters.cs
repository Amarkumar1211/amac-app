using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AmacBackend.Migrations
{
    /// <inheritdoc />
    public partial class AddDepartmentToReasonsMasters : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Department",
                table: "RejectionReasonMasters",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Department",
                table: "GapReasonMasters",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Department",
                table: "RejectionReasonMasters");

            migrationBuilder.DropColumn(
                name: "Department",
                table: "GapReasonMasters");
        }
    }
}
